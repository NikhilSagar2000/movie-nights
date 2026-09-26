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
	/** The resolution I want to receive (null = auto). Each person picks their own. */
	quality: Quality;
	/** What my partner wants to receive; applied to my encoder while I'm sharing. */
	peerQuality: Quality;
	peerCamOn: boolean;
	peerMicOn: boolean;
};

export type Quality = 480 | 720 | 1080 | 1440 | null;
const BITRATE: Record<480 | 720 | 1080 | 1440, number> = { 480: 1_200_000, 720: 2_500_000, 1080: 5_000_000, 1440: 9_000_000 };
// Cameras: 720p normally, 480p while a movie plays (the bubbles are small then, and the upload belongs to the movie).
const CAM_VIDEO: MediaTrackConstraints = { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 24, max: 30 }, facingMode: "user" };
const CAM_TIERS = { normal: { height: 720, bitrate: 1_500_000 }, movie: { height: 480, bitrate: 700_000 } };
const readQuality = (): Quality => {
	const q = Number(localStorage.getItem("quality"));
	return q === 480 || q === 720 || q === 1080 || q === 1440 ? q : null;
};

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
	quality: readQuality(),
	peerQuality: null,
	peerCamOn: true,
	peerMicOn: true,
};
const listeners = new Set<() => void>();
function set(patch: Partial<CallState>) {
	state = { ...state, ...patch };
	listeners.forEach((l) => l());
}

let you: Who = "a";
let pc: RTCPeerConnection | null = null;
let pcid = ""; // the current connection attempt; signals from other attempts are dropped
let builtAt = 0;
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
	if (t.length < 4 || state.remoteCam?.getTracks()[0] === t[0].receiver.track) return; // same pc: keep the streams bound
	set({
		remoteCam: new MediaStream([t[0].receiver.track, t[1].receiver.track]),
		remoteScreen: new MediaStream([t[2].receiver.track, t[3].receiver.track]),
	});
}

async function tune(slot: number, maxBitrate: number, scaleResolutionDownBy = 1) {
	const sender = slots()[slot]?.sender;
	const p = sender?.getParameters();
	const e = p?.encodings?.[0];
	if (!sender || !p || !e) return; // not negotiated yet; retried when signaling settles
	if (e.maxBitrate === maxBitrate && (e.scaleResolutionDownBy ?? 1) === scaleResolutionDownBy) return;
	e.maxBitrate = maxBitrate;
	e.scaleResolutionDownBy = scaleResolutionDownBy;
	await sender.setParameters(p).catch(() => {});
}

/** Encode my shared tab at the resolution my partner picked (the capture itself stays full-size for my own preview). */
function tuneScreen() {
	const height = state.localScreen?.getVideoTracks()[0]?.getSettings().height;
	if (!height) return;
	const want = state.peerQuality ?? 1440;
	void tune(2, BITRATE[want], Math.max(1, height / want));
}

function tuneCam() {
	const height = state.localCam?.getVideoTracks()[0]?.getSettings().height;
	if (!height) return;
	const tier = state.localScreen || state.peerSharing ? CAM_TIERS.movie : CAM_TIERS.normal;
	void tune(1, tier.bitrate, Math.max(1, height / tier.height));
}

function capBitrates() {
	tuneCam();
	tuneScreen();
}

// The tab's capture size changes when its window is resized; keep the scale factor right.
setInterval(() => state.localScreen && tuneScreen(), 3000);

/** Prefer H.264 for the movie: Macs and most PCs encode it in hardware, which keeps 1440p smooth. */
function preferH264(t: RTCRtpTransceiver) {
	const codecs = RTCRtpReceiver.getCapabilities("video")?.codecs ?? [];
	const h264 = codecs.filter((c) => c.mimeType === "video/H264");
	if (h264.length) t.setCodecPreferences([...h264, ...codecs.filter((c) => c.mimeType !== "video/H264")]);
}

/** Movie audio should not sound like a phone call: ask the remote end's Opus encoder for 128 kbps stereo. */
export const stereoOpus = (sdp: string) =>
	sdp.replace(/(a=fmtp:\d+ [^\r\n]*useinbandfec=1)(?![^\r\n]*stereo=1)/g, "$1;stereo=1;sprop-stereo=1;maxaveragebitrate=128000");

/** "a" names a new attempt; "b" adopts the id from the offer. */
function newPeer(sid: string, id = crypto.randomUUID().slice(0, 8)) {
	pc?.close();
	if (sid !== peerSid) setPeerSharing(false); // a reloaded partner isn't sharing anymore; same page = keep the movie
	peerSid = sid;
	pcid = id;
	builtAt = Date.now();
	makingOffer = ignoreOffer = false;
	const conn = new RTCPeerConnection({ iceServers });
	pc = conn;
	const signal = (m: Omit<Extract<RelayData, { k: "signal" }>, "k" | "sid" | "pcid">) => relay({ k: "signal", sid: sessionId, pcid: id, ...m });
	set({ connection: conn.connectionState, remoteCam: null, remoteScreen: null });

	conn.onnegotiationneeded = async () => {
		try {
			makingOffer = true;
			await conn.setLocalDescription();
			signal({ description: conn.localDescription!.toJSON() });
		} catch (e) {
			console.warn("[rtc] offer failed", e);
		} finally {
			makingOffer = false;
		}
	};
	conn.onicecandidate = ({ candidate }) => signal({ candidate: candidate?.toJSON() ?? null });
	conn.onconnectionstatechange = () => {
		if (conn !== pc) return;
		const s = conn.connectionState;
		set({ connection: s });
		if (s === "connected") announce(); // whatever order we arrived in, the partner hears where we're at
		if (s === "failed") {
			setPeerSharing(false);
			conn.restartIce(); // if that doesn't take, the watchdog rebuilds
		}
	};
	conn.onsignalingstatechange = () => {
		if (conn.signalingState === "stable") capBitrates();
	};

	if (!polite()) {
		for (const [kind, ms] of [["audio", camMs], ["video", camMs], ["video", screenMs], ["audio", screenMs]] as const) {
			conn.addTransceiver(kind, { direction: "sendrecv", streams: [ms] });
		}
		preferH264(conn.getTransceivers()[2]);
		attachLocal();
		exposeRemote();
	}
}

async function onSignal(data: Extract<RelayData, { k: "signal" }>) {
	if (data.pcid !== pcid) {
		// "b" follows "a" onto a new attempt; everything else from another attempt is stale.
		if (!polite() || data.description?.type !== "offer") return;
		newPeer(data.sid, data.pcid);
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
						if (i === 2) preferH264(t);
					}
				});
				attachLocal();
				exposeRemote();
				await conn.setLocalDescription();
				relay({ k: "signal", sid: sessionId, pcid, description: conn.localDescription!.toJSON() });
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

const partner = (online: Peer[] = getRoom()?.online ?? []) => online.find((p) => p.who === other(you));

/** Tell the partner where we're at. Relays can be lost while a socket is down, so this is re-sent on every reunion. */
function announce() {
	relay({ k: "quality", height: state.quality });
	relayAv();
	relay({ k: "share", on: !!state.localScreen });
}

/** Get a stuck call going again: "a" starts a fresh attempt, "b" asks "a" to. */
let lastHeal = 0;
function heal() {
	const peer = partner();
	if (!peer || pc?.connectionState === "connected" || Date.now() - lastHeal < 8000) return;
	lastHeal = Date.now();
	if (polite()) relay({ k: "ready", sid: sessionId });
	else newPeer(peer.sid);
}

// Watchdog: an attempt that hasn't connected within 15s (lost offer, ICE restart that went nowhere) gets rebuilt.
setInterval(() => {
	if (state.started && pc?.connectionState !== "connected" && Date.now() - builtAt > 15_000) heal();
}, 5000);

let wasConnected = true;
let peerWasHere = false;
function onRoom() {
	const room = getRoom();
	if (!room) return;
	const peer = partner(room.online);
	// "a" drives: a new sid means they reloaded, so build a fresh connection. A missing peer may be a blip; keep the call.
	if (!polite() && peer && peer.sid !== peerSid) newPeer(peer.sid);
	const reunited = (room.connected && !wasConnected) || (!!peer && !peerWasHere);
	wasConnected = room.connected;
	peerWasHere = !!peer;
	if (reunited) {
		announce();
		heal();
	}
}

function setPeerSharing(on: boolean) {
	set({ peerSharing: on });
	muteForMovie(on);
	tuneCam();
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
				video: CAM_VIDEO,
				audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
			})
			.catch(() => null),
		fetch("/api/turn")
			.then((r) => (r.ok ? r.json() : null))
			.catch(() => null),
	]);
	if (turn?.iceServers) iceServers = turn.iceServers;
	set({ localCam: cam, camOn: !!cam?.getVideoTracks().length, error: cam ? null : "Camera/mic not available — you can still watch and chat 💕" });
	attachLocal();

	onRelay((from, data) => {
		if (from === you) return;
		if (data.k === "signal") void onSignal(data);
		// The partner came through the door or lost the call: offers sent meanwhile were lost, so start over.
		if (data.k === "ready" && !polite()) newPeer(data.sid);
		if (data.k === "share") setPeerSharing(data.on);
		if (data.k === "av") set({ peerCamOn: data.cam, peerMicOn: data.mic });
		if (data.k === "quality") {
			set({ peerQuality: data.height });
			tuneScreen();
		}
	});
	builtAt = Date.now();
	peerWasHere = !!partner();
	subscribe(onRoom);
	onRoom();
	if (polite()) relay({ k: "ready", sid: sessionId });
}

type FocusController = { setFocusBehavior(b: "focus-captured-surface" | "no-focus-change"): void };

export async function startShare() {
	// Keep the sharer on our site (Chrome normally jumps to the shared tab), so they watch like the partner does.
	const Controller = (window as unknown as { CaptureController?: new () => FocusController }).CaptureController;
	const controller = Controller ? new Controller() : undefined;
	try {
		controller?.setFocusBehavior("no-focus-change");
	} catch {}
	let stream: MediaStream;
	try {
		stream = await navigator.mediaDevices.getDisplayMedia({
			controller,
			video: { displaySurface: "browser", width: { max: 2560 }, height: { max: 1440 }, frameRate: { max: 30 } },
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
	try {
		controller?.setFocusBehavior("no-focus-change"); // older Chrome only accepts it right after the picker
	} catch {}
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
	capBitrates();
	relay({ k: "share", on: true });
	muteForMovie(true);
}

export function stopShare() {
	state.localScreen?.getTracks().forEach((t) => t.stop());
	sessionStorage.removeItem("sharing");
	set({ localScreen: null, wasSharing: false });
	attachLocal();
	tuneCam();
	relay({ k: "share", on: false });
	muteForMovie(false);
}

/** My picture preference; the partner's browser encodes to it whenever they share. */
export function setQuality(height: Quality) {
	if (height) localStorage.setItem("quality", String(height));
	else localStorage.removeItem("quality");
	set({ quality: height });
	relay({ k: "quality", height });
}

const relayAv = () =>
	relay({ k: "av", cam: state.camOn && !!state.localCam?.getVideoTracks().length, mic: state.micOn && !!state.localCam?.getAudioTracks().length });

export function setMic(on: boolean) {
	state.localCam?.getAudioTracks().forEach((t) => (t.enabled = on));
	set({ micOn: on });
	relayAv();
}

/** Camera off really releases the camera (the light goes out); on asks for it again. */
export async function setCam(on: boolean) {
	if (on === state.camOn) return;
	const audio = state.localCam?.getAudioTracks() ?? [];
	if (on) {
		const cam = await navigator.mediaDevices.getUserMedia({ video: CAM_VIDEO }).catch(() => null);
		if (!cam) return set({ error: "Couldn't turn the camera back on. Check Chrome's camera permission for this site 📷" });
		set({ camOn: true, localCam: new MediaStream([...audio, ...cam.getVideoTracks()]) });
	} else {
		state.localCam?.getVideoTracks().forEach((t) => t.stop());
		set({ camOn: false, localCam: new MediaStream(audio) });
	}
	attachLocal();
	capBitrates();
	relayAv();
}

export const dismissReshare = () => {
	sessionStorage.removeItem("sharing");
	set({ wasSharing: false });
};

export const useCall = () =>
	useSyncExternalStore(
		(fn) => {
			listeners.add(fn);
			return () => void listeners.delete(fn);
		},
		() => state,
	);
