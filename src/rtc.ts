import { useSyncExternalStore } from "react";
import { other, type Peer, type RelayData, type Who } from "../shared/types";
import { getRoom, onRelay, relay, sessionId, subscribe } from "./room";

/**
 * One RTCPeerConnection with 4 fixed transceiver slots, created once per partner session:
 *   0 cam audio · 1 cam video · 2 screen video · 3 screen audio
 * Sharing starts/stops with replaceTrack, so it never renegotiates. The m-line order is the same on both
 * sides, so each side finds a track by slot index. Signaling is MDN's "perfect negotiation".
 */

export type CallState = {
	started: boolean;
	localCam: MediaStream | null;
	remoteCam: MediaStream | null;
	localScreen: MediaStream | null;
	remoteScreen: MediaStream | null;
	peerSharing: boolean;
	micOn: boolean;
	camOn: boolean;
	connection: RTCPeerConnectionState | "none";
	/** This tab was sharing before a refresh; the capture is gone and needs a click to restart. */
	wasSharing: boolean;
	error: string | null;
};

const SCREEN_BITRATE = 5_000_000;
const CAM_BITRATE = 350_000;

let state: CallState = {
	started: false,
	localCam: null,
	remoteCam: null,
	localScreen: null,
	remoteScreen: null,
	peerSharing: false,
	micOn: true,
	camOn: true,
	connection: "none",
	wasSharing: sessionStorage.getItem("sharing") === "1",
	error: null,
};
const listeners = new Set<() => void>();
function set(patch: Partial<CallState>) {
	state = { ...state, ...patch };
	listeners.forEach((l) => l());
}

let you: Who = "a";
let pc: RTCPeerConnection | null = null;
let peerSid: string | null = null;
let makingOffer = false;
let ignoreOffer = false;
let iceServers: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];
let micBeforeMovie: boolean | null = null;
const camMs = new MediaStream(); // msid groups so audio and video stay lip-synced on the receiver
const screenMs = new MediaStream();

const polite = () => you === "b"; // "a" is impolite: it creates the slots and wins offer collisions

function localTrack(slot: number): MediaStreamTrack | null {
	if (slot === 0) return state.localCam?.getAudioTracks()[0] ?? null;
	if (slot === 1) return state.localCam?.getVideoTracks()[0] ?? null;
	if (slot === 2) return state.localScreen?.getVideoTracks()[0] ?? null;
	return state.localScreen?.getAudioTracks()[0] ?? null;
}

const slots = () => pc?.getTransceivers() ?? [];

function attachLocal() {
	slots().forEach((t, i) => void t.sender.replaceTrack(localTrack(i)).catch(() => {}));
}

function exposeRemote() {
	const t = slots();
	if (t.length < 4) return;
	set({
		remoteCam: new MediaStream([t[0].receiver.track, t[1].receiver.track]),
		remoteScreen: new MediaStream([t[2].receiver.track, t[3].receiver.track]),
	});
}

async function capBitrates() {
	const t = slots();
	for (const [i, max] of [[1, CAM_BITRATE], [2, SCREEN_BITRATE]] as const) {
		const sender = t[i]?.sender;
		if (!sender) continue;
		const p = sender.getParameters();
		if (!p.encodings?.length) continue;
		p.encodings[0].maxBitrate = max;
		await sender.setParameters(p).catch(() => {});
	}
}

/** Movie audio should not sound like a phone call: ask the remote end's Opus encoder for 128 kbps stereo. */
export const stereoOpus = (sdp: string) =>
	sdp.replace(/(a=fmtp:\d+ [^\r\n]*useinbandfec=1)(?![^\r\n]*stereo=1)/g, "$1;stereo=1;sprop-stereo=1;maxaveragebitrate=128000");

function newPeer(sid: string) {
	pc?.close();
	peerSid = sid;
	makingOffer = ignoreOffer = false;
	const conn = new RTCPeerConnection({ iceServers });
	pc = conn;
	set({ connection: conn.connectionState, remoteCam: null, remoteScreen: null, peerSharing: false });

	conn.onnegotiationneeded = async () => {
		try {
			makingOffer = true;
			await conn.setLocalDescription();
			relay({ k: "signal", sid: sessionId, description: conn.localDescription!.toJSON() });
		} catch (e) {
			console.warn("[rtc] offer failed", e);
		} finally {
			makingOffer = false;
		}
	};
	conn.onicecandidate = ({ candidate }) => relay({ k: "signal", sid: sessionId, candidate: candidate?.toJSON() ?? null });
	conn.onconnectionstatechange = () => {
		if (conn !== pc) return;
		set({ connection: conn.connectionState });
		if (conn.connectionState === "failed") conn.restartIce();
	};
	conn.onsignalingstatechange = () => {
		if (conn.signalingState === "stable") void capBitrates();
	};

	if (!polite()) {
		for (const [kind, ms] of [["audio", camMs], ["video", camMs], ["video", screenMs], ["audio", screenMs]] as const) {
			conn.addTransceiver(kind, { direction: "sendrecv", streams: [ms] });
		}
		attachLocal();
		exposeRemote();
	}
	if (state.localScreen) relay({ k: "share", on: true }); // tell the (re)joined partner we're sharing
}

async function onSignal(data: Extract<RelayData, { k: "signal" }>) {
	if (data.sid !== peerSid) {
		if (data.description?.type !== "offer") return; // leftovers from an old session
		newPeer(data.sid);
	}
	const conn = pc!;
	try {
		if (data.description) {
			const d = data.description;
			const collision = d.type === "offer" && (makingOffer || conn.signalingState !== "stable");
			ignoreOffer = !polite() && collision;
			if (ignoreOffer) return;
			await conn.setRemoteDescription({ type: d.type, sdp: stereoOpus(d.sdp ?? "") });
			if (d.type === "offer") {
				// Polite side: the offer created the 4 slots as recvonly; start sending on them before answering.
				slots().forEach((t, i) => {
					if (t.direction !== "sendrecv") {
						t.direction = "sendrecv";
						t.sender.setStreams(i < 2 ? camMs : screenMs);
					}
				});
				attachLocal();
				exposeRemote();
				await conn.setLocalDescription();
				relay({ k: "signal", sid: sessionId, description: conn.localDescription!.toJSON() });
			}
		} else if (data.candidate !== undefined) {
			try {
				await conn.addIceCandidate(data.candidate ?? undefined);
			} catch (e) {
				if (!ignoreOffer) throw e;
			}
		}
	} catch (e) {
		console.warn("[rtc] signal failed", e);
	}
}

function onPresence(online: Peer[]) {
	const peer = online.find((p) => p.who === other(you));
	// A new sid means they reloaded: build a fresh connection. A missing peer may just be a blip; keep the call.
	if (peer && peer.sid !== peerSid) newPeer(peer.sid);
}

function muteForMovie(movie: boolean) {
	if (movie && micBeforeMovie === null) {
		micBeforeMovie = state.micOn;
		setMic(false);
	} else if (!movie && micBeforeMovie !== null && !state.localScreen && !state.peerSharing) {
		setMic(micBeforeMovie);
		micBeforeMovie = null;
	}
}

/** Call from the "Come in" click: that gesture unlocks sound and the cam/mic prompt. */
export async function startCall(me: Who) {
	if (state.started) return;
	you = me;
	set({ started: true });
	const [cam, turn] = await Promise.all([
		navigator.mediaDevices
			.getUserMedia({
				video: { width: 320, height: 320, frameRate: 15, facingMode: "user" },
				audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
			})
			.catch(() => null),
		fetch("/api/turn")
			.then((r) => (r.ok ? r.json() : null))
			.catch(() => null),
	]);
	if (turn?.iceServers) iceServers = turn.iceServers;
	set({ localCam: cam, error: cam ? null : "Camera/mic not available — you can still watch and chat 💕" });
	attachLocal();

	onRelay((from, data) => {
		if (from === you) return;
		if (data.k === "signal") void onSignal(data);
		if (data.k === "share") {
			set({ peerSharing: data.on });
			muteForMovie(data.on);
		}
	});
	subscribe(() => {
		const room = getRoom();
		if (room) onPresence(room.online);
	});
	const room = getRoom();
	if (room) onPresence(room.online);
}

export async function startShare() {
	let stream: MediaStream;
	try {
		stream = await navigator.mediaDevices.getDisplayMedia({
			video: { displaySurface: "browser", width: { max: 1920 }, height: { max: 1080 }, frameRate: { max: 30 } },
			// Movie sound, untouched by voice processing.
			audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
			selfBrowserSurface: "exclude",
			surfaceSwitching: "include",
			monitorTypeSurfaces: "exclude",
			preferCurrentTab: false,
		} as DisplayMediaStreamOptions);
	} catch {
		return; // picker cancelled
	}
	const video = stream.getVideoTracks()[0];
	video.contentHint = "motion";
	video.onended = () => stopShare();
	sessionStorage.setItem("sharing", "1");
	set({
		localScreen: stream,
		wasSharing: false,
		error: stream.getAudioTracks().length ? null : "No sound is being shared — pick a Chrome tab and tick “Also share tab audio” 🔊",
	});
	attachLocal();
	void capBitrates();
	relay({ k: "share", on: true });
	muteForMovie(true);
}

export function stopShare() {
	state.localScreen?.getTracks().forEach((t) => t.stop());
	sessionStorage.removeItem("sharing");
	set({ localScreen: null, wasSharing: false });
	attachLocal();
	relay({ k: "share", on: false });
	muteForMovie(false);
}

export function setMic(on: boolean) {
	state.localCam?.getAudioTracks().forEach((t) => (t.enabled = on));
	set({ micOn: on });
}

export function setCam(on: boolean) {
	state.localCam?.getVideoTracks().forEach((t) => (t.enabled = on));
	set({ camOn: on });
}

export const dismissReshare = () => {
	sessionStorage.removeItem("sharing");
	set({ wasSharing: false });
};

export function endCall() {
	pc?.close();
	pc = peerSid = null;
	state.localCam?.getTracks().forEach((t) => t.stop());
	state.localScreen?.getTracks().forEach((t) => t.stop());
}

export const useCall = () =>
	useSyncExternalStore(
		(fn) => {
			listeners.add(fn);
			return () => void listeners.delete(fn);
		},
		() => state,
	);
