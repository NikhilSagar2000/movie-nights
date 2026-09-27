// Play a movie file: the file stays on this laptop. A <video> here plays it, and its picture and sound go to the
// partner over the call's screen slots (rtc.ts), like a shared tab. Nothing is uploaded.
// This laptop owns the player: the partner's buttons arrive as "film:do" requests, and every change goes back out as
// "film" state (from the player's own events, so nothing echoes). The element lives here, not in React, so the movie
// keeps playing while you look at another page.
import { useSyncExternalStore } from "react";
import type { FilmAct, FilmState, RelayData } from "../shared/types";
import { decodeSubs, order, srtToVtt, titleOf } from "./filmLogic";
import { getRoom, onRelay, relay, send } from "./room";
import { setScreenTracks, shareFilm, stopShare } from "./rtc";

type Episode = { video: File; sub: File | null };
/** A file Chrome can't fully play: its sound (AC3/DTS) or its picture (e.g. HEVC). */
export type Problem = { name: string; kind: "sound" | "picture" };
type Store = {
	/** What I'm playing (null = nothing). */
	mine: FilmState | null;
	/** What the partner is playing, and when that arrived (performance.now()). */
	theirs: FilmState | null;
	theirsAt: number;
	/** The subtitle line on screen now (mine, or theirs). */
	line: string;
	problem: Problem | null;
	/** Subtitles shown on this device (each of you decides). */
	cc: boolean;
};

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
export const canPlayFiles = typeof HTMLMediaElement !== "undefined" && "captureStream" in HTMLMediaElement.prototype;

let store: Store = {
	mine: null,
	theirs: null,
	theirsAt: 0,
	line: "",
	problem: null,
	cc: (() => {
		try {
			return localStorage.getItem("cc") !== "off";
		} catch {
			return true;
		}
	})(),
};
/** Film messages only make sense now: while the socket is down they're dropped, not queued (the queue is for chat,
 *  letters and ratings; the heartbeat catches the partner up after a reconnect). */
const live = (d: RelayData) => void (getRoom()?.connected && relay(d));

const subs = new Set<() => void>();
function set(patch: Partial<Store>) {
	store = { ...store, ...patch };
	subs.forEach((f) => f());
}
const subscribe = (f: () => void) => (subs.add(f), () => void subs.delete(f));
export const useFilm = () => useSyncExternalStore(subscribe, () => store);

export function setCc(on: boolean) {
	try {
		localStorage.setItem("cc", on ? "on" : "off");
	} catch {
		/* no storage: it resets next visit */
	}
	set({ cc: on });
}
export const dismissProblem = () => set({ problem: null });

// ---------- the player (created on first use) ----------

let el: HTMLVideoElement | null = null;
let holder: HTMLDivElement | null = null;
let capture: MediaStream | null = null;
let queue: Episode[] = [];
let idx = 0;
let url = "";
let subUrl = "";
let nextIn: number | null = null;
let countdown = 0;
let loadId = 0;
let soundCheck = 0;

/** Off the Theater page the player waits here: still in the page (a <video> taken out of it pauses) but invisible. */
function player() {
	if (el) return el;
	holder = document.createElement("div");
	holder.style.cssText = "position:fixed;left:0;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none";
	holder.setAttribute("aria-hidden", "true");
	el = document.createElement("video");
	el.className = "th-video";
	el.playsInline = true;
	el.setAttribute("aria-label", "The movie");
	holder.append(el);
	document.body.append(holder);
	for (const ev of ["play", "playing", "waiting", "pause", "seeked", "loadedmetadata", "durationchange"]) el.addEventListener(ev, update);
	el.addEventListener("ended", ended);
	el.addEventListener("playing", () => {
		clearTimeout(soundCheck);
		soundCheck = window.setTimeout(checkSound, 2500);
	});
	el.addEventListener("loadedmetadata", () => el!.videoWidth === 0 && problem("picture"));
	el.addEventListener("error", () => el!.getAttribute("src") && problem("picture"));
	// The capture adds new tracks for each file (the old ones linger, "live" but silent): send the current file's.
	capture = (el as HTMLVideoElement & { captureStream(): MediaStream }).captureStream();
	capture.onaddtrack = () => setScreenTracks(capture!.getTracks());
	return el;
}

/** The stage shows the player while the Theater is open; it goes back to its holder (in the same step) when it closes. */
export function showPlayer(stage: HTMLElement) {
	stage.append(player());
	return () => void holder?.append(player());
}
export const setFilmVolume = (v: number) => el && (el.volume = v);
/** The volume you left it at (it keeps playing while you're on another page). */
export const filmVolume = () => el?.volume ?? 1;

function problem(kind: Problem["kind"]) {
	const name = queue[idx]?.video.name;
	if (name) set({ problem: { name, kind } });
}
function checkSound() {
	const v = el;
	if (!v || v.paused || !queue.length) return;
	const decoded = (v as HTMLVideoElement & { webkitAudioDecodedByteCount?: number }).webkitAudioDecodedByteCount;
	if (!capture?.getAudioTracks().length && !decoded) problem("sound");
}

function snapshot(): FilmState | null {
	const v = el;
	const ep = queue[idx];
	if (!v || !ep) return null;
	return {
		i: idx,
		title: titleOf(ep.video.name).slice(0, 120),
		pos: v.currentTime || 0,
		dur: Number.isFinite(v.duration) ? v.duration : 0,
		playing: !v.paused && !v.ended && v.readyState > 2, // not while it loads or buffers: their clock would run ahead
		next: queue[idx + 1] ? titleOf(queue[idx + 1].video.name).slice(0, 120) : null,
		nextIn,
		subs: !!ep.sub,
	};
}

// Every change goes out at most once per 250 ms (a dragged slider seeks many times); the heartbeat catches up a
// partner who reloaded or reconnected.
let sendTimer = 0;
function update() {
	set({ mine: snapshot() });
	if (sendTimer) return;
	sendTimer = window.setTimeout(() => {
		sendTimer = 0;
		if (queue.length) live({ k: "film", film: snapshot() });
	}, 250);
}
setInterval(() => {
	if (!queue.length) return;
	live({ k: "film", film: snapshot() });
	savePlace();
}, 5000);

// ---------- where you were (a refresh loses the file; picking it again carries on) ----------

const PLACE = "film:place";
function savePlace() {
	const v = el,
		ep = queue[idx];
	if (!v || !ep || !v.duration) return;
	try {
		if (v.duration - v.currentTime > 60 && v.currentTime > 10) localStorage.setItem(PLACE, JSON.stringify({ name: ep.video.name, pos: v.currentTime }));
		else if (v.duration - v.currentTime <= 60) localStorage.removeItem(PLACE); // finished: next time starts fresh
	} catch {
		/* no storage: no resume */
	}
}
function savedPlace(): { name: string; pos: number } | null {
	try {
		const p = JSON.parse(localStorage.getItem(PLACE) ?? "null");
		return typeof p?.name === "string" && Number.isFinite(p.pos) ? p : null;
	} catch {
		return null;
	}
}

// ---------- playing ----------

/** Files from the picker: videos in episode order, with their subtitles. */
export function playFiles(files: File[]) {
	const list = order(files);
	if (!list.length) return;
	if (getRoom()?.tube) send({ t: "tube:stop" }); // the movie takes the stage from a YouTube video, for both of you
	player();
	shareFilm(teardown); // ends a shared tab or an earlier film first
	queue = list;
	const place = savedPlace();
	const at = place ? list.findIndex((e) => e.video.name === place.name) : -1;
	void load(Math.max(0, at), at >= 0 ? place!.pos : 0);
}

async function load(i: number, at = 0) {
	const v = player();
	const id = ++loadId;
	stopCountdown();
	idx = i;
	const ep = queue[i];
	clearTimeout(soundCheck);
	set({ problem: null, line: "" });
	live({ k: "film:sub", text: "" });
	// forget the last file: its tracks, its object URLs, its subtitles
	capture?.getTracks().forEach((t) => capture!.removeTrack(t));
	setScreenTracks([]);
	v.querySelectorAll("track").forEach((t) => t.remove());
	URL.revokeObjectURL(url);
	URL.revokeObjectURL(subUrl);
	url = URL.createObjectURL(ep.video);
	subUrl = "";
	v.src = url;
	if (at > 0) v.addEventListener("loadedmetadata", () => id === loadId && (v.currentTime = at), { once: true });
	void v.play().catch(() => {});
	update();
	if (!ep.sub) return;
	const text = srtToVtt(decodeSubs(await ep.sub.arrayBuffer()));
	if (id !== loadId) return; // another file started meanwhile
	subUrl = URL.createObjectURL(new Blob([text], { type: "text/vtt" }));
	const track = document.createElement("track");
	track.kind = "subtitles";
	track.src = subUrl;
	v.append(track);
	track.track.mode = "hidden"; // drawn by FilmSubs on both screens, not by the browser on this one
	track.track.oncuechange = () => {
		const cues = [...(track.track.activeCues ?? [])] as VTTCue[];
		const line = cues
			.map((c) => c.getCueAsHTML().textContent ?? "")
			.join("\n")
			.slice(0, 500);
		set({ line });
		live({ k: "film:sub", text: line });
	};
}

function ended() {
	if (queue[idx + 1] && nextIn === null) {
		nextIn = 10;
		countdown = window.setInterval(() => {
			if (nextIn !== null && --nextIn <= 0) void load(idx + 1);
			else update();
		}, 1000);
	}
	update();
}
function stopCountdown() {
	clearInterval(countdown);
	nextIn = null;
}

/** Runs however the film stops (its Stop, "End movie night", a tab shared over it): rtc's stopShare calls it. */
function teardown() {
	savePlace();
	stopCountdown();
	clearTimeout(soundCheck);
	loadId++;
	queue = [];
	capture?.getTracks().forEach((t) => capture!.removeTrack(t));
	if (el) {
		el.pause();
		el.querySelectorAll("track").forEach((t) => t.remove());
		el.removeAttribute("src");
		el.load();
	}
	URL.revokeObjectURL(url);
	URL.revokeObjectURL(subUrl);
	url = subUrl = "";
	set({ mine: null, line: "", problem: null });
	live({ k: "film", film: null });
}

/** A button press, from either of you. Mine: applied here. Theirs: sent to their laptop (and shown right away). */
export function filmDo(act: FilmAct, pos?: number) {
	if (queue.length) return apply(act, pos, idx);
	const t = store.theirs;
	if (!t) return;
	live({ k: "film:do", act, pos, i: t.i }); // not queued: a pause pressed during a blip mustn't land minutes later
	const now = theirsNow();
	if (act === "play" || act === "pause") set({ theirs: { ...t, pos: now, playing: act === "play" }, theirsAt: performance.now() });
	if (act === "seek" && Number.isFinite(pos)) set({ theirs: { ...t, pos: clamp(pos!, 0, t.dur), nextIn: null }, theirsAt: performance.now() });
}
export const stopFilm = () => queue.length && stopShare();

function apply(act: FilmAct, pos: number | undefined, i: number | undefined) {
	const v = el;
	if (!v || !queue.length) return;
	if (act === "next") {
		if (i === idx && queue[idx + 1]) void load(idx + 1); // a doubled "next" (timer + click) only skips once
		return;
	}
	if (nextIn !== null) {
		stopCountdown(); // any other press keeps you on this episode
		update();
	}
	if (act === "play") void v.play().catch(() => {});
	else if (act === "pause") v.pause();
	else if (act === "seek" && typeof pos === "number" && Number.isFinite(pos)) v.currentTime = clamp(pos, 0, v.duration || 0);
}

// ---------- the partner's film ----------

/** Where their movie is now: the last report, plus the time since it came. */
function theirsNow() {
	const t = store.theirs;
	if (!t) return 0;
	return t.playing ? Math.min(t.dur || Infinity, t.pos + (performance.now() - store.theirsAt) / 1000) : t.pos;
}

/** The film on screen, mine or theirs, and where it is. Theirs counts only while their share is on and still reporting. */
export function filmNow(peerSharing: boolean): { film: FilmState; pos: number; mine: boolean } | null {
	if (store.mine) return { film: store.mine, pos: el?.currentTime ?? store.mine.pos, mine: true };
	const t = store.theirs;
	if (!t || !peerSharing || performance.now() - store.theirsAt > 12_000) return null;
	return { film: t, pos: theirsNow(), mine: false };
}

const str = (x: unknown, max: number) => (typeof x === "string" ? x.slice(0, max) : null);
const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) && x >= 0 ? x : null);
/** Relays come from the partner's browser: take only well-formed state. */
function readFilm(x: unknown): FilmState | null {
	if (!x || typeof x !== "object") return null;
	const f = x as Record<string, unknown>;
	const i = num(f.i),
		title = str(f.title, 120),
		pos = num(f.pos),
		dur = num(f.dur);
	if (i === null || title === null || pos === null || dur === null) return null;
	return { i, title, pos, dur, playing: f.playing === true, next: str(f.next, 120), nextIn: num(f.nextIn), subs: f.subs === true };
}
const ACTS: readonly FilmAct[] = ["play", "pause", "seek", "next", "stay"];

onRelay((from, d: RelayData) => {
	if (from === getRoom()?.you) return;
	if (d.k === "film") {
		const film = readFilm(d.film);
		set({ theirs: film, theirsAt: performance.now(), ...(film ? {} : { line: "" }) });
	} else if (d.k === "film:sub" && !queue.length) set({ line: str(d.text, 500) ?? "" });
	else if (d.k === "film:do" && ACTS.includes(d.act)) apply(d.act, num(d.pos) ?? undefined, num(d.i) ?? undefined);
});
