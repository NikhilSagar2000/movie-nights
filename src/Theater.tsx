// The movie room: stage, reactions, chat drawer, nudges, toolbar, View menu.
// Also exports what FaceCams (mounted on every page) needs: media hooks, the per-device view store, icons, nudges.
import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
	useSyncExternalStore,
	type ComponentProps,
	type CSSProperties,
	type FormEvent,
	type KeyboardEvent as ReactKeyboardEvent,
	type MouseEvent,
	type PointerEvent as ReactPointerEvent,
} from "react";
import { LIMITS, other } from "../shared/types";
import { onRelay, profileOf, relay, send, useRoom, type RoomState } from "./room";
import { dismissReshare, setCam, setMic, setQuality, startShare, stopShare, useCall, type CallState, type Quality } from "./rtc";
import Teddy from "./Teddy";
import "./theater.css";

type Mood = NonNullable<ComponentProps<typeof Teddy>["mood"]>;
export type Vars = CSSProperties & Record<`--${string}`, string | number>;

const REACTIONS = ["💗", "😂", "😭", "😱", "🥰", "🍿"];
const STICKERS: Mood[] = ["love", "cheer", "popcorn", "sleep", "peek", "sad"];
const MAX_FLOATERS = 40;
const QUALITIES = [1440, 1080, 720, 480] as const;
const STAGE_KEYS = { ArrowRight: 0.05, ArrowUp: 0.05, ArrowLeft: -0.05, ArrowDown: -0.05 };

export const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const isTyping = (t: EventTarget | null) =>
	t instanceof HTMLElement && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));
const timeOf = (at: number) => new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

// ---------- icons ----------
const ICONS = {
	mic: "M12 3a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM5 11a7 7 0 0 0 14 0M12 18v3",
	cam: "M4 7h9a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2zM15 11l6-3.5v9L15 13",
	eye: "M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z",
	expand: "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5",
	shrink: "M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5",
	chat: "M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-8l-5 4v-4H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z",
	heart: "M12 20s-7-4.3-8.8-8.6C1.9 8.2 4 5 7.2 5c2 0 3.3 1.1 4.8 2.9C13.5 6.1 14.8 5 16.8 5 20 5 22.1 8.2 20.8 11.4 19 15.7 12 20 12 20z",
	grip: "M20 13l-7 7M20 6L6 20",
	close: "M6 6l12 12M18 6L6 18",
	minus: "M5 12h14",
} as const;

export function Icon({ name, off, filled, className }: { name: keyof typeof ICONS; off?: boolean; filled?: boolean; className?: string }) {
	return (
		<svg
			className={`th-icon${className ? ` ${className}` : ""}`}
			viewBox="0 0 24 24"
			width="22"
			height="22"
			aria-hidden="true"
			fill={filled ? "currentColor" : "none"}
			stroke="currentColor"
			strokeWidth="2.2"
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<path d={ICONS[name]} />
			{off && <path d="M3 3l18 18" />}
		</svg>
	);
}

// ---------- media helpers ----------

/** Attach a stream to a <video>. Streams are replaced when the partner reconnects, so this re-runs per stream object. */
export function useVideo(stream: MediaStream | null, muted: boolean) {
	const ref = useRef<HTMLVideoElement>(null);
	const [blocked, setBlocked] = useState(false);
	useEffect(() => {
		const v = ref.current;
		if (!v) return;
		v.srcObject = stream;
		v.muted = muted;
		setBlocked(false);
		if (!stream) return;
		v.play().catch((e: DOMException) => {
			if (muted || e.name !== "NotAllowedError") return;
			// Autoplay with sound was refused: play silently and offer a tap to unmute.
			v.muted = true;
			setBlocked(true);
			void v.play().catch(() => {});
		});
	}, [stream, muted]);
	const unblock = () => {
		const v = ref.current;
		if (!v) return;
		v.muted = false;
		void v.play().then(() => setBlocked(false), () => {});
	};
	return { ref, blocked, unblock };
}

/** True while a remote video track is actually receiving frames (false before connecting, with no camera, or when not shared). */
export function useLive(stream: MediaStream | null) {
	const track = stream?.getVideoTracks()[0];
	const [live, setLive] = useState(false);
	useEffect(() => {
		if (!track) return setLive(false);
		const sync = () => setLive(!track.muted && track.readyState === "live");
		sync();
		track.addEventListener("mute", sync);
		track.addEventListener("unmute", sync);
		track.addEventListener("ended", sync);
		return () => {
			track.removeEventListener("mute", sync);
			track.removeEventListener("unmute", sync);
			track.removeEventListener("ended", sync);
		};
	}, [track]);
	return live;
}

// ---------- per-device view prefs (hide toggles + layouts), saved in localStorage "view" ----------

/** A cam bubble's spot: position as a 0..1 fraction of the free space (so it survives window resizes) + size in px. */
export type Spot = { fx?: number; fy?: number; size?: number };
type Layout = { me: Spot; them: Spot };
/** On the theater page: "movie" while anyone is sharing, "idle" otherwise. Every other page: "page". Each keeps its own tweaks. */
export type LayoutMode = "movie" | "idle" | "page";
type View = { hideSelf: boolean; hidePartner: boolean; hideMovie: boolean; min: boolean; stage: number } & Record<LayoutMode, Layout>;

const FRESH_LAYOUT = { min: false, stage: 1, movie: { me: {}, them: {} }, idle: { me: {}, them: {} }, page: { me: {}, them: {} } };
const DEFAULT_VIEW: View = { hideSelf: false, hidePartner: false, hideMovie: false, ...FRESH_LAYOUT };

let view: View = (() => {
	try {
		const s = JSON.parse(localStorage.getItem("view") ?? "{}");
		return {
			...DEFAULT_VIEW,
			...s,
			movie: { ...DEFAULT_VIEW.movie, ...s.movie },
			idle: { ...DEFAULT_VIEW.idle, ...s.idle },
			page: { ...DEFAULT_VIEW.page, ...s.page },
		};
	} catch {
		return DEFAULT_VIEW;
	}
})();
const viewListeners = new Set<() => void>();

export function saveView() {
	try {
		localStorage.setItem("view", JSON.stringify(view));
	} catch {
		/* private mode: prefs just won't stick */
	}
}
/** Pass persist=false during a drag and call saveView() when the gesture ends. */
export function setView(patch: Partial<View>, persist = true) {
	view = { ...view, ...patch };
	viewListeners.forEach((l) => l());
	if (persist) saveView();
}
export function setSpot(mode: LayoutMode, who: keyof Layout, patch: Spot, persist = true) {
	const layout: Layout = { ...view[mode], [who]: { ...view[mode][who], ...patch } };
	setView({ [mode]: layout } as Partial<View>, persist);
}
export const useView = () =>
	useSyncExternalStore(
		(fn) => {
			viewListeners.add(fn);
			return () => void viewListeners.delete(fn);
		},
		() => view,
	);

// ---------- nudges (mounted globally inside FaceCams) ----------

let audioCtx: AudioContext | null = null;
/** A soft bell: sine notes with a quick attack and long fade. No audio files. */
function chime(notes: number[]) {
	try {
		const ctx = (audioCtx ??= new AudioContext());
		void ctx.resume();
		notes.forEach((freq, i) => {
			const t = ctx.currentTime + i * 0.2;
			const osc = ctx.createOscillator();
			const gain = ctx.createGain();
			osc.type = "sine";
			osc.frequency.value = freq;
			gain.gain.setValueAtTime(0.0001, t);
			gain.gain.exponentialRampToValueAtTime(0.3, t + 0.02);
			gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
			osc.connect(gain).connect(ctx.destination);
			osc.start(t);
			osc.stop(t + 1.2);
		});
	} catch {
		/* no Web Audio: the toast still shows */
	}
}

const baseTitle = document.title;
let titleTimer: number | undefined;
/** The host may be on the movie tab, so blink this tab's title where they can see it. */
function flashTitle(text: string, ms = 6000) {
	clearInterval(titleTimer);
	const end = Date.now() + ms;
	document.title = text;
	titleTimer = window.setInterval(() => {
		if (Date.now() > end) {
			clearInterval(titleTimer);
			document.title = baseTitle;
		} else document.title = document.title === text ? baseTitle : text;
	}, 700);
}

const HUG_HEARTS = Array.from({ length: 16 }, (_, i) => ({ x: (i * 37 + 11) % 100, d: (i % 5) * 0.18, s: 18 + ((i * 7) % 24) }));

export function NudgeListener() {
	const room = useRoom();
	const [nudge, setNudge] = useState<{ kind: "pause" | "hug"; key: number } | null>(null);

	useEffect(
		() =>
			onRelay((_, d) => {
				if (d.k !== "nudge" || (d.kind !== "pause" && d.kind !== "hug")) return;
				setNudge({ kind: d.kind, key: Date.now() });
				if (d.kind === "pause") {
					chime([784, 587]);
					flashTitle("🥺 pause please!");
				} else chime([523, 659, 784]);
			}),
		[],
	);
	useEffect(() => {
		if (!nudge) return;
		const t = setTimeout(() => setNudge(null), nudge.kind === "hug" ? 2600 : 7000);
		return () => clearTimeout(t);
	}, [nudge]);

	if (!room || !nudge) return null;
	const them = profileOf(room, other(room.you));
	if (nudge.kind === "hug")
		return (
			<div className="fc-hug" role="status" key={nudge.key}>
				{HUG_HEARTS.map((h, i) => (
					<span key={i} className="fc-hug-heart" style={{ "--x": `${h.x}%`, "--d": `${h.d}s`, "--s": `${h.s}px` } as Vars}>
						<Icon name="heart" filled />
					</span>
				))}
				<span className="fc-hug-teddy">
					<Teddy mood="love" size={200} accent={them.color} />
				</span>
				<p className="fc-hug-text">{them.name} sent you a big hug 🤗</p>
			</div>
		);
	return (
		<div className="fc-pause" role="alert" key={nudge.key}>
			<Teddy mood="sad" size={64} accent={them.color} />
			<div className="fc-pause-copy">
				<strong>{them.name} asks: please pause 🥺</strong>
				<span>Press ⏯ on your keyboard or use Chrome's media control.</span>
			</div>
			<button className="btn icon ghost" aria-label="Dismiss" onClick={() => setNudge(null)}>
				<Icon name="close" />
			</button>
		</div>
	);
}

// ---------- the Theater page ----------

export default function Theater() {
	const room = useRoom();
	const call = useCall();
	return room ? <TheaterRoom room={room} call={call} /> : null;
}

type Floater = { id: number; emoji: string; x: number; drift: number; dur: number; size: number };
let floaterSeq = 0;

function TheaterRoom({ room, call }: { room: RoomState; call: CallState }) {
	const v = useView();
	const partner = other(room.you);
	const me = profileOf(room, room.you);
	const them = profileOf(room, partner);
	const partnerHere = room.online.some((p) => p.who === partner);
	const hosting = !!call.localScreen;
	const sharing = hosting || call.peerSharing;
	const pictureLive = useLive(call.remoteScreen);
	const showing = hosting || (call.peerSharing && pictureLive); // curtains stay shut until frames arrive

	// ---- reactions: shown locally + relayed; remote ones arrive via onRelay ----
	const [floaters, setFloaters] = useState<Floater[]>([]);
	const float = useCallback((emoji: string, x: number) => {
		const f: Floater = {
			id: ++floaterSeq,
			emoji,
			x: clamp(x, 0.05, 0.95),
			drift: Math.round((Math.random() - 0.5) * 140),
			dur: 2.6 + Math.random() * 1.4,
			size: 0.85 + Math.random() * 0.5,
		};
		setFloaters((fs) => [...fs.slice(-(MAX_FLOATERS - 1)), f]);
	}, []);
	const react = useCallback(
		(emoji: string, x = 0.15 + Math.random() * 0.7) => {
			float(emoji, x);
			relay({ k: "react", emoji, x });
		},
		[float],
	);
	useEffect(
		() =>
			onRelay((_, d) => {
				if (d.k === "react" && typeof d.emoji === "string" && d.emoji.length <= 16) float(d.emoji, Number(d.x) || 0.5);
			}),
		[float],
	);
	const burst = (e: MouseEvent<HTMLDivElement>) => {
		if ((e.target as HTMLElement).closest("button, a, input")) return;
		const r = e.currentTarget.getBoundingClientRect();
		const x = (e.clientX - r.left) / r.width;
		for (let i = 0; i < 5; i++) react("💗", x + (Math.random() - 0.5) * 0.14);
	};

	// ---- keyboard: 1–6 react, hold Space to talk ----
	const talkPrev = useRef<boolean | null>(null);
	const [talking, setTalking] = useState(false);
	useEffect(() => {
		const release = () => {
			if (talkPrev.current === null) return;
			setMic(talkPrev.current);
			talkPrev.current = null;
			setTalking(false);
		};
		const down = (e: KeyboardEvent) => {
			if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
			if (e.code === "Space") {
				e.preventDefault();
				if (talkPrev.current === null) {
					talkPrev.current = call.micOn;
					setMic(true);
					setTalking(true);
				}
			} else if (/^[1-6]$/.test(e.key) && !e.repeat) react(REACTIONS[+e.key - 1]);
		};
		const up = (e: KeyboardEvent) => {
			if (e.code !== "Space" || talkPrev.current === null) return;
			e.preventDefault();
			release();
		};
		addEventListener("keydown", down);
		addEventListener("keyup", up);
		addEventListener("blur", release);
		return () => {
			removeEventListener("keydown", down);
			removeEventListener("keyup", up);
			removeEventListener("blur", release);
		};
	}, [call.micOn, react]);
	useEffect(
		() => () => {
			if (talkPrev.current !== null) setMic(talkPrev.current); // left the page mid-talk
		},
		[],
	);

	// ---- fullscreen: the whole document, so cams, reactions, chat and nudges stay visible ----
	const [full, setFull] = useState(() => !!document.fullscreenElement);
	useEffect(() => {
		const sync = () => setFull(!!document.fullscreenElement);
		document.addEventListener("fullscreenchange", sync);
		return () => {
			document.removeEventListener("fullscreenchange", sync);
			if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
		};
	}, []);
	const toggleFull = () =>
		document.fullscreenElement ? void document.exitFullscreen() : void document.documentElement.requestFullscreen().catch(() => {});

	// ---- stage size: the largest 16:9 that fits below the toolbar, times the user's scale (0.4–1) ----
	const wrapRef = useRef<HTMLElement>(null);
	const aboveRef = useRef<HTMLDivElement>(null);
	const [above, setAbove] = useState(220);
	useLayoutEffect(() => {
		const measure = () => {
			const w = wrapRef.current;
			if (w && !w.classList.contains("is-full")) setAbove(Math.round(w.getBoundingClientRect().top + scrollY));
		};
		measure();
		const ro = new ResizeObserver(measure);
		if (aboveRef.current) ro.observe(aboveRef.current);
		addEventListener("resize", measure);
		return () => {
			ro.disconnect();
			removeEventListener("resize", measure);
		};
	}, [full]);
	const sizing = useRef<{ x: number; w: number; fit: number } | null>(null);
	const sizeDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
		const w = wrapRef.current?.getBoundingClientRect().width;
		if (!w || e.button !== 0) return;
		e.currentTarget.setPointerCapture(e.pointerId);
		sizing.current = { x: e.clientX, w, fit: w / v.stage };
	};
	const sizeMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
		const s = sizing.current;
		if (s) setView({ stage: clamp((s.w + 2 * (e.clientX - s.x)) / s.fit, 0.4, 1) }, false); // centered, so both edges move
	};
	const sizeUp = () => {
		if (!sizing.current) return;
		sizing.current = null;
		saveView();
	};
	const sizeKey = (e: ReactKeyboardEvent<HTMLButtonElement>) => {
		const d = (STAGE_KEYS as Record<string, number>)[e.key];
		if (!d) return;
		e.preventDefault();
		setView({ stage: clamp(v.stage + d, 0.4, 1) });
	};

	// ---- chat drawer + unread badge ----
	const [chatOpen, setChatOpen] = useState(false);
	const chatBtn = useRef<HTMLButtonElement>(null);
	const lastId = room.chat.at(-1)?.id ?? null;
	const [seenId, setSeenId] = useState(lastId);
	useEffect(() => {
		if (chatOpen) setSeenId(lastId);
	}, [chatOpen, lastId]);
	const seenIdx = seenId ? room.chat.findIndex((m) => m.id === seenId) : -1;
	const unread = chatOpen ? 0 : room.chat.slice(seenIdx + 1).filter((m) => m.from !== room.you).length;
	const closeChat = () => {
		setChatOpen(false);
		chatBtn.current?.focus();
	};

	// ---- nudges out ----
	const [sent, setSent] = useState<"pause" | "hug" | null>(null);
	useEffect(() => {
		if (!sent) return;
		const t = setTimeout(() => setSent(null), 2500);
		return () => clearTimeout(t);
	}, [sent]);
	const nudge = (kind: "pause" | "hug") => {
		relay({ k: "nudge", kind });
		setSent(kind);
	};

	const [volume, setVolume] = useState(1);
	const [hiddenError, setHiddenError] = useState<string | null>(null);
	const [ending, setEnding] = useState(false);
	const status = !partnerHere ? "away" : call.connection === "connected" ? "together" : "connecting";

	return (
		<main className={`page theater${sharing ? " lights-off" : ""}`}>
			<div className="th-col">
				<div className="th-above" ref={aboveRef}>
					<header className="th-head">
						<h1>The Theater</h1>
						<span className={`th-status ${status}`} role="status">
							{status === "away" ? `${them.name} is away 💤` : status === "together" ? "together 💞" : "connecting…"}
						</span>
					</header>

					{call.error && call.error !== hiddenError && (
						<div className="th-banner" role="alert">
							<Teddy mood="think" size={44} accent={me.color} />
							<p>{call.error}</p>
							<button className="btn icon ghost" aria-label="Dismiss" onClick={() => setHiddenError(call.error)}>
								<Icon name="close" />
							</button>
						</div>
					)}

					<div className="th-toolbar">
						<div className="th-group">
							<button
								className={`btn icon ${call.micOn ? "soft" : "is-off"}`}
								aria-label="Microphone"
								aria-pressed={call.micOn}
								disabled={!call.localCam}
								onClick={() => setMic(!call.micOn)}
							>
								<Icon name="mic" off={!call.micOn} />
							</button>
							<button
								className={`btn icon ${call.camOn ? "soft" : "is-off"}`}
								aria-label="Camera (what your love sees)"
								aria-pressed={call.camOn}
								disabled={!call.localCam}
								onClick={() => setCam(!call.camOn)}
							>
								<Icon name="cam" off={!call.camOn} />
							</button>
							{talking ? (
								<span className="th-ptt on" role="status">
									🎙️ talking…
								</span>
							) : (
								<span className="th-ptt">
									Hold <kbd>Space</kbd> to talk
								</span>
							)}
						</div>
						<div className="th-group">
							<button className="btn soft" disabled={!partnerHere || sent === "pause"} onClick={() => nudge("pause")}>
								{sent === "pause" ? "Asked 💌" : "Please pause 🥺"}
							</button>
							<button className="btn soft" disabled={!partnerHere || sent === "hug"} onClick={() => nudge("hug")}>
								{sent === "hug" ? "Hug sent 💌" : "Send a hug 🤗"}
							</button>
						</div>
						<div className="th-group">
							<ViewMenu view={v} partnerName={them.name} />
							<label className="th-quality" title="The picture quality you receive when your love shares">
								<span>My picture</span>
								<select value={call.quality ?? ""} onChange={(e) => setQuality(e.target.value ? (+e.target.value as Quality) : null)}>
									<option value="">Auto</option>
									{QUALITIES.map((q) => (
										<option key={q} value={q}>
											{q}p
										</option>
									))}
								</select>
							</label>
							<button className="btn" onClick={() => setEnding(true)}>
								End movie night 🎟️
							</button>
						</div>
					</div>
				</div>

				<section
					ref={wrapRef}
					className={`th-stage-wrap${full ? " is-full" : ""}`}
					style={{ "--above": `${above}px`, "--scale": v.stage } as Vars}
					aria-label="Movie screen"
				>
					{/* Floats over the stage's corner; becomes the slim "movie hidden" bar when the stage is collapsed. */}
					<div className={`th-stage-top${v.hideMovie ? " bar" : ""}`}>
						{v.hideMovie && (
							<>
								<span>{sharing ? "Movie hidden — sound still playing 🔊" : "Movie screen hidden"}</span>
								<button className="btn sm soft" onClick={() => setView({ hideMovie: false })}>
									Show
								</button>
							</>
						)}
						<div className="th-stage-tools">
							<button
								ref={chatBtn}
								className="btn icon soft th-chat-toggle"
								aria-label={unread ? `Chat, ${unread} unread` : "Chat"}
								aria-expanded={chatOpen}
								onClick={() => (chatOpen ? closeChat() : setChatOpen(true))}
							>
								<Icon name="chat" />
								{unread > 0 && <span className="th-badge">{unread > 9 ? "9+" : unread}</span>}
							</button>
							<button className="btn icon soft" aria-label={full ? "Exit fullscreen" : "Fullscreen"} onClick={toggleFull}>
								<Icon name={full ? "shrink" : "expand"} />
							</button>
						</div>
					</div>
					<div className={`th-stage${v.hideMovie ? " collapsed" : ""}`} onDoubleClick={burst}>
						{hosting ? <LocalPreview stream={call.localScreen!} /> : call.peerSharing ? <RemoteMovie stream={call.remoteScreen} volume={volume} /> : null}

						<div className={`th-curtains${showing ? " open" : ""}`} aria-hidden="true">
							<i className="th-curtain l" />
							<i className="th-curtain r" />
							<i className="th-valance" />
						</div>

						{!showing && (
							<div className="th-empty">
								<span className="th-teddy">
									<Teddy mood="popcorn" size={104} accent={me.color} />
								</span>
								{call.peerSharing ? (
									<p className="th-marquee">{them.name} is starting the movie…</p>
								) : call.wasSharing ? (
									<>
										<p className="th-marquee">The projector blinked!</p>
										<div className="th-cta">
											<button className="btn big" onClick={() => void startShare()}>
												Re-share the movie 🎬
											</button>
											<button className="btn ghost sm on-curtain" onClick={dismissReshare}>
												Not now
											</button>
										</div>
									</>
								) : (
									<>
										<p className="th-marquee">
											Now showing: {me.name} &amp; {them.name}
										</p>
										<button className="btn big" onClick={() => void startShare()}>
											Share a tab to start the movie 🎬
										</button>
									</>
								)}
							</div>
						)}

						<div className="th-floaters" aria-hidden="true">
							{floaters.map((f) => (
								<span
									key={f.id}
									className="th-floater"
									style={{ left: `${f.x * 100}%`, "--drift": `${f.drift}px`, "--dur": `${f.dur}s`, "--scale": f.size } as Vars}
									onAnimationEnd={() => setFloaters((fs) => fs.filter((o) => o.id !== f.id))}
								>
									{f.emoji}
								</span>
							))}
						</div>

					</div>

					<div className="th-bar">
						<div className="th-reactions" role="group" aria-label="Reactions">
							{REACTIONS.map((e, i) => (
								<button key={e} className="th-react" aria-label={`Send ${e} (key ${i + 1})`} title={`Key ${i + 1}`} onClick={() => react(e)}>
									{e}
								</button>
							))}
						</div>
						{hosting && (
							<div className="th-share-note">
								<button className="btn sm" onClick={stopShare}>
									Stop sharing
								</button>
								<span>
									Your movie plays in its own tab. Stay here with your love 💕 (pause with the ⏯ key)
									<br />
									Sending to {them.name} in {call.peerQuality ? `${call.peerQuality}p` : "Auto"}
								</span>
							</div>
						)}
						{call.peerSharing && !hosting && (
							<label className="th-volume">
								<span>Movie volume</span>
								<input type="range" min={0} max={1} step={0.05} value={volume} onChange={(e) => setVolume(+e.target.value)} />
							</label>
						)}
					</div>

					{!full && !v.hideMovie && (
						<button
							className="th-size"
							aria-label={`Resize the movie screen, ${Math.round(v.stage * 100)}% (arrow keys)`}
							onPointerDown={sizeDown}
							onPointerMove={sizeMove}
							onPointerUp={sizeUp}
							onPointerCancel={sizeUp}
							onKeyDown={sizeKey}
						>
							<Icon name="grip" />
						</button>
					)}
				</section>

				{!sharing && (
					<aside className="th-tips" aria-label="Sharing tips">
						<p>
							<strong>How to share:</strong> pick a <b>Chrome tab</b> with the movie and tick <b>“Also share tab audio”</b>. Headphones help avoid
							echo.
						</p>
						<details>
							<summary>Movie has no sound?</summary>
							<p>Some downloaded .mkv files use AC3/DTS audio that Chrome can't play. Convert it once (the picture stays untouched):</p>
							<code className="th-cmd">ffmpeg -i movie.mkv -c:v copy -c:a aac movie.mp4</code>
						</details>
					</aside>
				)}
			</div>

			<ChatDrawer room={room} open={chatOpen} onClose={closeChat} />
			{ending && <EndNightDialog initial={room.picked?.item.title ?? ""} hosting={hosting} onClose={() => setEnding(false)} />}
		</main>
	);
}

/** Native popover: light-dismiss, Esc and focus handling come free. */
function ViewMenu({ view: v, partnerName }: { view: View; partnerName: string }) {
	return (
		<>
			<button className="btn soft th-view-btn" popoverTarget="th-view-menu">
				View 👁
			</button>
			<div id="th-view-menu" popover="auto" className="th-view-menu">
				<p className="th-view-title">On this device only</p>
				<label className="th-view-opt">
					<input type="checkbox" checked={v.hideSelf} onChange={(e) => setView({ hideSelf: e.target.checked })} />
					<span>
						Hide my self-view
						<small>{partnerName} still sees you</small>
					</span>
				</label>
				<label className="th-view-opt">
					<input type="checkbox" checked={v.hidePartner} onChange={(e) => setView({ hidePartner: e.target.checked })} />
					<span>
						Hide {partnerName}'s cam
						<small>You'll still hear them</small>
					</span>
				</label>
				<label className="th-view-opt">
					<input type="checkbox" checked={v.hideMovie} onChange={(e) => setView({ hideMovie: e.target.checked })} />
					<span>
						Hide the movie
						<small>The sound keeps playing</small>
					</span>
				</label>
				<button className="btn ghost sm" onClick={() => setView(FRESH_LAYOUT)}>
					Reset layout
				</button>
			</div>
		</>
	);
}

function LocalPreview({ stream }: { stream: MediaStream }) {
	const { ref } = useVideo(stream, true);
	return <video ref={ref} className="th-video" playsInline aria-label="Preview of the tab you're sharing" />;
}

function RemoteMovie({ stream, volume }: { stream: MediaStream | null; volume: number }) {
	const { ref, blocked, unblock } = useVideo(stream, false);
	const [height, setHeight] = useState(0); // what actually arrives, which can dip below the chosen quality
	useEffect(() => {
		if (ref.current) ref.current.volume = volume;
	}, [ref, volume]);
	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		const sync = () => setHeight(el.videoHeight);
		sync();
		el.addEventListener("resize", sync);
		return () => el.removeEventListener("resize", sync);
	}, [ref]);
	return (
		<>
			<video ref={ref} className="th-video" autoPlay playsInline aria-label="The movie" />
			{height > 0 && (
				<span className="th-res" title="Picture quality arriving right now">
					{height}p
				</span>
			)}
			{blocked && (
				<button className="btn th-tap-sound" onClick={unblock}>
					Tap for sound 🔊
				</button>
			)}
		</>
	);
}

function ChatDrawer({ room, open, onClose }: { room: RoomState; open: boolean; onClose: () => void }) {
	const [text, setText] = useState("");
	const [picker, setPicker] = useState(false);
	const listRef = useRef<HTMLOListElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);
	const lastId = room.chat.at(-1)?.id;
	useEffect(() => {
		const l = listRef.current;
		if (open && l) l.scrollTop = l.scrollHeight;
	}, [open, lastId]);
	useEffect(() => {
		if (open && matchMedia("(pointer: fine)").matches) inputRef.current?.focus(); // no surprise keyboard on phones
	}, [open]);

	const submit = (e: FormEvent) => {
		e.preventDefault();
		const t = text.trim();
		if (!t) return;
		send({ t: "chat", text: t });
		setText("");
	};
	const sticker = (s: Mood) => {
		send({ t: "chat", sticker: s });
		setPicker(false);
	};

	return (
		<aside className={`th-chat${open ? " open" : ""}`} aria-label="Chat" inert={!open} onKeyDown={(e) => e.key === "Escape" && onClose()}>
			<header className="th-chat-head">
				<h2>Whispers 💌</h2>
				<button className="btn icon ghost" aria-label="Close chat" onClick={onClose}>
					<Icon name="close" />
				</button>
			</header>
			<ol className="th-chat-list" ref={listRef} aria-live="polite">
				{room.chat.length === 0 && (
					<li className="th-chat-empty">
						<Teddy mood="peek" size={84} />
						<p>No whispers yet. Say hi 💌</p>
					</li>
				)}
				{room.chat.map((m, i) => {
					const p = profileOf(room, m.from);
					const first = i === 0 || room.chat[i - 1].from !== m.from;
					const mood = STICKERS.find((s) => s === m.sticker);
					return (
						<li key={m.id} className={`th-msg${m.from === room.you ? " mine" : ""}`} style={{ "--who": p.color } as Vars}>
							{first && <span className="th-msg-name">{p.name}</span>}
							{m.sticker ? (
								<Teddy mood={mood ?? "love"} size={76} accent={p.color} label={`${m.sticker} teddy sticker`} />
							) : (
								<p className="th-msg-text">{m.text}</p>
							)}
							<time dateTime={new Date(m.at).toISOString()}>{timeOf(m.at)}</time>
						</li>
					);
				})}
			</ol>
			{picker && (
				<div className="th-stickers" role="group" aria-label="Teddy stickers">
					{STICKERS.map((s) => (
						<button key={s} className="th-sticker" aria-label={`Send ${s} teddy`} onClick={() => sticker(s)}>
							<Teddy mood={s} size={40} accent={profileOf(room, room.you).color} />
						</button>
					))}
				</div>
			)}
			<form className="th-chat-form" onSubmit={submit}>
				<button
					type="button"
					className={`btn icon soft${picker ? " is-on" : ""}`}
					aria-label="Teddy stickers"
					aria-expanded={picker}
					onClick={() => setPicker((p) => !p)}
				>
					<Teddy mood="love" size={26} />
				</button>
				<input
					ref={inputRef}
					className="input"
					value={text}
					onChange={(e) => setText(e.target.value)}
					maxLength={LIMITS.chat}
					placeholder="Say something sweet…"
					aria-label="Message"
				/>
				<button className="btn" disabled={!text.trim()}>
					Send
				</button>
			</form>
		</aside>
	);
}

function EndNightDialog({ initial, hosting, onClose }: { initial: string; hosting: boolean; onClose: () => void }) {
	const ref = useRef<HTMLDialogElement>(null);
	const [title, setTitle] = useState(initial);
	useEffect(() => {
		const d = ref.current;
		if (d && !d.open) d.showModal(); // native modal: focus stays inside, Esc closes
	}, []);
	const submit = (e: FormEvent) => {
		e.preventDefault();
		const t = title.trim();
		if (!t) return;
		if (hosting) stopShare();
		send({ t: "stub:new", title: t });
		location.hash = "#/memories";
	};
	return (
		<dialog ref={ref} className="th-end" onClose={onClose} aria-labelledby="end-h">
			<form onSubmit={submit}>
				<Teddy mood="popcorn" size={92} />
				<h2 id="end-h">That's a wrap! 🎟️</h2>
				<p className="muted">What did you two watch tonight? We'll print a ticket stub for your memories wall.</p>
				<label className="sr-only" htmlFor="end-title">
					Movie title
				</label>
				<input
					id="end-title"
					className="input"
					autoFocus
					maxLength={LIMITS.title}
					value={title}
					onChange={(e) => setTitle(e.target.value)}
					placeholder="Movie title"
				/>
				<div className="th-end-actions">
					<button type="button" className="btn ghost" onClick={() => ref.current?.close()}>
						Not yet
					</button>
					<button className="btn" disabled={!title.trim()}>
						Print our stub
					</button>
				</div>
			</form>
		</dialog>
	);
}
