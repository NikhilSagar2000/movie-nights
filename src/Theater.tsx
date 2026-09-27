// The movie room: stage, reactions, chat drawer, nudges, toolbar, View menu.
// Also exports what FaceCams (mounted on every page) needs: media hooks, the per-device view store, icons, nudges.
import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
	useSyncExternalStore,
	type CSSProperties,
	type FormEvent,
	type KeyboardEvent as ReactKeyboardEvent,
	type MouseEvent,
	type PointerEvent as ReactPointerEvent,
} from "react";
import {
	ArrowsOutLineHorizontal,
	CaretDown,
	ChatCircleDots,
	CornersIn,
	CornersOut,
	FrameCorners,
	HandPalm,
	Heart,
	Microphone,
	MicrophoneSlash,
	PaperPlaneTilt,
	Screencast,
	SlidersHorizontal,
	SpeakerHigh,
	Sticker,
	Ticket,
	VideoCamera,
	VideoCameraSlash,
	WarningCircle,
	X,
} from "@phosphor-icons/react";
import { LIMITS, other, type Tube, type Who } from "../shared/types";
import { Duo, Face, Flower, FlowerRain, Head, type HeadProps } from "./Character";
import { getRoom, onRelay, profileOf, relay, send, useRoom, type RoomState } from "./room";
import { dismissReshare, setCam, setMic, setQuality, setTubeMovie, startShare, stopShare, useCall, type CallState, type Quality } from "./rtc";
import { TubeBar, TubePlayer, TubeStart } from "./Tube";
import "./theater.css";

export type Vars = CSSProperties & Record<`--${string}`, string | number>;

/** "💗" stays on the wire (older tabs understand it) but is drawn as his flower. */
const FLOWER = "💗";
const REACTIONS = [FLOWER, "😂", "😭", "😱", "🥰", "🍿"];
const Emoji = ({ e }: { e: string }) => (e === FLOWER ? <Flower /> : <>{e}</>);
/** Sticker ids are stored in chat history, so they never change; each one is the sender's head in a pose. */
const STICKERS = ["love", "cheer", "popcorn", "sleep", "peek", "sad"] as const;
type StickerId = (typeof STICKERS)[number];
const POSES: Record<StickerId, Pick<HeadProps, "mood" | "moment" | "blush" | "twinkle">> = {
	love: { blush: true, moment: "wiggle" },
	cheer: { mood: "hop" },
	popcorn: { mood: "bob" },
	sleep: { mood: "away" },
	peek: { twinkle: true },
	sad: { mood: "aww" },
};
const MAX_FLOATERS = 40;
const QUALITIES = [1440, 1080, 720, 480] as const;
const STAGE_KEYS = { ArrowRight: 0.05, ArrowUp: 0.05, ArrowLeft: -0.05, ArrowDown: -0.05 };

export const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const isTyping = (t: EventTarget | null) =>
	t instanceof HTMLElement && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));
const timeOf = (at: number) => new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

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
/** `mirrorPartner`: show their camera mirrored like your own view (on by default; the older `flipPartner` is ignored). */
type View = { hideSelf: boolean; hidePartner: boolean; hideMovie: boolean; mirrorPartner: boolean; min: boolean; stage: number } & Record<LayoutMode, Layout>;

const FRESH_LAYOUT = { min: false, stage: 1, movie: { me: {}, them: {} }, idle: { me: {}, them: {} }, page: { me: {}, them: {} } };
const DEFAULT_VIEW: View = { hideSelf: false, hidePartner: false, hideMovie: false, mirrorPartner: true, ...FRESH_LAYOUT };

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
/** Knock knock: two short wooden taps (a poke). */
function knock() {
	try {
		const ctx = (audioCtx ??= new AudioContext());
		void ctx.resume();
		[0, 0.17].forEach((dt) => {
			const t = ctx.currentTime + dt;
			const osc = ctx.createOscillator();
			const gain = ctx.createGain();
			osc.type = "triangle";
			osc.frequency.setValueAtTime(420, t);
			osc.frequency.exponentialRampToValueAtTime(140, t + 0.09);
			gain.gain.setValueAtTime(0.0001, t);
			gain.gain.exponentialRampToValueAtTime(0.5, t + 0.005);
			gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
			osc.connect(gain).connect(ctx.destination);
			osc.start(t);
			osc.stop(t + 0.16);
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

// ---------- flowers: his flower, sent from the theater toolbar or your own cam bubble ----------

const FLOWER_COOLDOWN = 2500;
let flowerAt = 0;
const flowersOut = new Set<() => void>();
const flowersIn = new Set<() => void>();
/** Sends a flower. Ignored inside the cooldown, so the toolbar and bubble buttons can't double-send. */
export function sendFlower() {
	if (Date.now() - flowerAt < FLOWER_COOLDOWN) return;
	flowerAt = Date.now();
	relay({ k: "nudge", kind: "flower" });
	flowersOut.forEach((f) => f());
}
const listen = (set: Set<() => void>) => (f: () => void) => {
	set.add(f);
	return () => void set.delete(f);
};
/** A flower you just sent (the bubbles fly it across) / one that arrived during a movie (shown small, by the cams). */
export const onFlowerOut = listen(flowersOut);
export const onFlowerIn = listen(flowersIn);
/** True for `ms` after each event, so every send button reads "sent" during the cooldown. */
function useJustSent(on: (f: () => void) => () => void, ms: number) {
	const [sent, setSent] = useState(false);
	useEffect(() => {
		let t: number | undefined;
		const off = on(() => {
			setSent(true);
			clearTimeout(t);
			t = window.setTimeout(() => setSent(false), ms);
		});
		return () => {
			off();
			clearTimeout(t);
		};
	}, [on, ms]);
	return sent;
}
export const useFlowerSent = () => useJustSent(onFlowerOut, FLOWER_COOLDOWN);

// ---------- poke: "I'm here", from Home or their cam bubble ----------

const POKE_COOLDOWN = 2500;
let pokeAt = 0;
const pokesOut = new Set<() => void>();
const pokesIn = new Set<() => void>();
/** Pokes them (sent as "boop", the name older tabs know). Returns false inside the cooldown. */
export function sendPoke() {
	if (Date.now() - pokeAt < POKE_COOLDOWN) return false;
	pokeAt = Date.now();
	relay({ k: "nudge", kind: "boop" });
	pokesOut.forEach((f) => f());
	return true;
}
export const onPokeOut = listen(pokesOut);
export const onPokeIn = listen(pokesIn);
export const usePokeSent = () => useJustSent(onPokeOut, POKE_COOLDOWN);

/** A movie (a shared tab, or a YouTube video playing) is on and you're on the theater page: nothing may cover the screen then, only small toasts. */
export const movieOn = (call: CallState, tube?: Tube | null) =>
	(!!call.localScreen || call.peerSharing || !!tube?.playing) && location.hash.replace(/^#\/?/, "") === "theater";

export function NudgeListener() {
	const room = useRoom();
	const call = useCall();
	const callNow = useRef(call);
	callNow.current = call;
	const [nudge, setNudge] = useState<{ kind: "pause" | "flower"; key: number } | null>(null);
	const [poke, setPoke] = useState<{ mine: boolean; key: number } | null>(null);

	useEffect(
		() =>
			onRelay((_, d) => {
				if (d.k !== "nudge") return;
				if (d.kind === "pause") {
					setNudge({ kind: "pause", key: Date.now() });
					chime([784, 587]);
					flashTitle("Please pause");
				} else if (d.kind === "flower" || (d.kind as string) === "hug") {
					// ("hug" is what tabs opened before the rename still send)
					chime([523, 659, 784]);
					if (movieOn(callNow.current, getRoom()?.tube)) flowersIn.forEach((f) => f()); // never cover the movie: the bubbles show it
					else setNudge({ kind: "flower", key: Date.now() });
				} else if (d.kind === "boop") {
					knock();
					setPoke({ mine: false, key: Date.now() });
					pokesIn.forEach((f) => f());
					const r = getRoom();
					if (document.hidden && r) flashTitle(`${profileOf(r, other(r.you)).name} poked you`, 4000);
				}
			}),
		[],
	);
	useEffect(() => onPokeOut(() => setPoke({ mine: true, key: Date.now() })), []);
	const tubeOn = !!room?.tube;
	useEffect(() => setTubeMovie(tubeOn), [tubeOn]); // a YouTube video mutes the mics like a movie
	useEffect(() => {
		if (!poke) return;
		const t = setTimeout(() => setPoke(null), poke.mine ? 2000 : 4000);
		return () => clearTimeout(t);
	}, [poke]);
	useEffect(() => {
		if (!nudge) return;
		const t = setTimeout(() => setNudge(null), nudge.kind === "flower" ? 6000 : 7000); // waits for the flower to land
		return () => clearTimeout(t);
	}, [nudge]);

	if (!room) return null;
	const partner = other(room.you);
	const them = profileOf(room, partner);
	const pokeToast = poke && (
		<div className={`fc-poke${poke.mine ? " mine" : ""}`} role="status" key={poke.key}>
			{poke.mine ? (
				<span>You poked {them.name}</span>
			) : (
				<>
					<Face who={partner} ring={them.color} moment="knock" s="2.6em" />
					<span>
						<b>{them.name}</b> poked you
					</span>
					<button
						className="btn sm"
						onClick={() => {
							sendPoke();
							setPoke(null);
						}}
					>
						Poke back
					</button>
				</>
			)}
		</div>
	);
	if (!nudge) return pokeToast;
	if (nudge.kind === "flower")
		return (
			<>
				{pokeToast}
				<FlowerOverlay key={nudge.key} from={partner} name={them.name} onClose={() => setNudge(null)} />
			</>
		);
	return (
		<>
			{pokeToast}
			<div className="fc-pause" role="alert" key={nudge.key}>
				<span className="fc-pause-head">
					<Head who={partner} moment="knock" h="6.2em" />
				</span>
				<div className="fc-pause-copy">
					<strong>{them.name} asks to pause</strong>
					<span>Press ⏯ on your keyboard or use Chrome's media control.</span>
				</div>
				<button className="btn icon ghost sm" aria-label="Dismiss" onClick={() => setNudge(null)}>
					<X aria-hidden />
				</button>
			</div>
		</>
	);
}

/** A flower arriving: it travels from the sender to you. From him, it leaves his hair and lands in hers;
 *  from her, it goes into his hair. Whoever receives it smiles and blushes when it lands. */
function FlowerOverlay({ from, name, onClose }: { from: Who; name: string; onClose: () => void }) {
	const [landed, setLanded] = useState(false);
	useEffect(() => {
		const t = setTimeout(() => setLanded(true), 2500); // .fc-flower-gift lands at 0.3s + 70% of 3.2s
		return () => clearTimeout(t);
	}, []);
	useEffect(() => {
		const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
		addEventListener("keydown", esc);
		return () => removeEventListener("keydown", esc);
	}, [onClose]);
	const flowerBack = () => {
		sendFlower();
		onClose();
	};
	const toHer = from === "a";
	const receiver = { moment: landed ? ("happy" as const) : null, blush: landed };
	return (
		<div className="fc-flower" role="status" onClick={(e) => e.target === e.currentTarget && onClose()}>
			<span className="face fc-flower-face">
				<Duo h="10.5em" a={toHer ? { flowerGone: true } : { flowerGone: !landed, ...receiver }} b={toHer ? receiver : undefined}>
					<Flower className={`fc-flower-gift${toHer ? "" : " to-him"}`} />
				</Duo>
			</span>
			<h2>{name} sent you a flower</h2>
			<button className="btn blush" onClick={flowerBack}>
				<Flower />
				Send one back
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
	const tube = sharing ? null : room.tube; // a shared tab takes the stage over a YouTube video
	const showing = hosting || (call.peerSharing && pictureLive) || !!tube; // curtains stay shut until frames arrive
	const share = () => {
		if (room.tube) send({ t: "tube:stop" });
		void startShare();
	};

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
	// in fullscreen the toolbar floats over the movie and fades once the pointer rests
	const [idle, setIdle] = useState(false);
	useEffect(() => {
		if (!full) {
			setIdle(false);
			return;
		}
		let t = 0;
		const wake = () => {
			setIdle(false);
			clearTimeout(t);
			t = window.setTimeout(() => setIdle(true), 3000);
		};
		wake();
		const evs = ["pointermove", "pointerdown", "keydown"] as const;
		evs.forEach((e) => addEventListener(e, wake));
		return () => {
			clearTimeout(t);
			evs.forEach((e) => removeEventListener(e, wake));
		};
	}, [full]);

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
	const [asked, setAsked] = useState(false);
	useEffect(() => {
		if (!asked) return;
		const t = setTimeout(() => setAsked(false), 2500);
		return () => clearTimeout(t);
	}, [asked]);
	const askPause = () => {
		relay({ k: "nudge", kind: "pause" });
		setAsked(true);
	};
	const flowerSent = useFlowerSent();

	const [volume, setVolume] = useState(1);
	const [hiddenError, setHiddenError] = useState<string | null>(null);
	const [ending, setEnding] = useState(false);
	const status = !partnerHere ? "away" : call.connection === "connected" ? "together" : "connecting";
	// Chat + fullscreen float on the stage's corner. Over a YouTube player that corner holds its title, so (outside
	// fullscreen) they move into the reaction pill.
	const tubeTools = !!tube && !full;
	const stageTools = (
		<div className="th-stage-tools">
			<button
				ref={chatBtn}
				className="btn icon glass th-chat-toggle"
				aria-label={unread ? `Chat, ${unread} unread` : "Chat"}
				aria-expanded={chatOpen}
				onClick={() => (chatOpen ? closeChat() : setChatOpen(true))}
			>
				<ChatCircleDots aria-hidden />
				{unread > 0 && <span className="th-badge">{unread > 9 ? "9+" : unread}</span>}
			</button>
			<button className="btn icon glass" aria-label={full ? "Exit fullscreen" : "Fullscreen"} onClick={toggleFull}>
				{full ? <CornersIn aria-hidden /> : <CornersOut aria-hidden />}
			</button>
		</div>
	);
	const bob = (w: Who) => ({ mood: w === partner && !partnerHere ? ("away" as const) : ("bob" as const) });

	return (
		<main className={`page theater${sharing || tube?.playing ? " lights-off" : ""}${full ? " is-full" : ""}${full && idle && !tube ? " idle" : ""}`}>
			{sharing && <i className="stars th-stars" />}
			<div className="th-col">
				<div className="th-above" ref={aboveRef}>
					<h1 className="sr-only">The Theater</h1>

					{call.error && call.error !== hiddenError && (
						<div className="th-banner" role="alert">
							<WarningCircle aria-hidden />
							<p>{call.error}</p>
							<button className="btn icon ghost sm" aria-label="Dismiss" onClick={() => setHiddenError(call.error)}>
								<X aria-hidden />
							</button>
						</div>
					)}

					<div className="th-toolbar">
						<div className="th-group">
							<button
								className={`btn icon glass${call.micOn ? "" : " is-off"}`}
								aria-label="Microphone"
								aria-pressed={call.micOn}
								disabled={!call.localCam}
								onClick={() => setMic(!call.micOn)}
							>
								{call.micOn ? <Microphone aria-hidden /> : <MicrophoneSlash aria-hidden />}
							</button>
							<button
								className={`btn icon glass${call.camOn ? "" : " is-off"}`}
								aria-label={`Camera (what ${them.name} sees)`}
								aria-pressed={call.camOn}
								disabled={!call.localCam}
								onClick={() => setCam(!call.camOn)}
							>
								{call.camOn ? <VideoCamera aria-hidden /> : <VideoCameraSlash aria-hidden />}
							</button>
							<span className={`chip ${status === "together" ? "sage" : "glass"} th-status`} role="status">
								{status === "together" ? <Heart weight="fill" aria-hidden /> : <span className="on-dot off" />}
								{status === "away" ? `${them.name} is away` : status === "together" ? "Together" : "Connecting"}
							</span>
						</div>
						<div className="th-group">
							{!tube && (
								<button className="btn glass th-tool" disabled={!partnerHere || asked} onClick={askPause}>
									<HandPalm aria-hidden />
									<span className="th-lbl">{asked ? "Asked" : "Please pause"}</span>
								</button>
							)}
							<button className="btn glass th-tool" disabled={!partnerHere || flowerSent} onClick={sendFlower}>
								<Flower />
								<span className="th-lbl">{flowerSent ? "Flower sent" : "Send a flower"}</span>
							</button>
							<ViewMenu view={v} partnerName={them.name} />
							<label className="th-quality" title={`The picture quality you receive when ${them.name} shares`}>
								<SlidersHorizontal className="th-quality-ico" aria-hidden />
								<span className="th-lbl">My picture</span>
								<span className="th-select">
									<select value={call.quality ?? ""} onChange={(e) => setQuality(e.target.value ? (+e.target.value as Quality) : null)}>
										<option value="">Auto</option>
										{QUALITIES.map((q) => (
											<option key={q} value={q}>
												{q}p
											</option>
										))}
									</select>
									<CaretDown aria-hidden />
								</span>
							</label>
						</div>
						<button className="btn paper th-end-btn" onClick={() => setEnding(true)}>
							<Ticket aria-hidden />
							<span>
								End<span className="th-lbl"> movie night</span>
							</span>
						</button>
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
								<span>{sharing ? "Movie hidden. The sound keeps playing." : "Movie screen hidden"}</span>
								<button className="btn sm glass" onClick={() => setView({ hideMovie: false })}>
									Show
								</button>
							</>
						)}
						{!tubeTools && stageTools}
					</div>
					<div className={`th-stage${v.hideMovie ? " collapsed" : ""}${showing ? "" : " arch"}`} onDoubleClick={burst}>
						{hosting ? (
							<LocalPreview stream={call.localScreen!} />
						) : call.peerSharing ? (
							<RemoteMovie stream={call.remoteScreen} volume={volume} />
						) : tube ? (
							<TubePlayer tube={tube} />
						) : null}

						{/* Sheer misty curtains: drawn until a picture arrives, then they part. */}
						<div className={`th-curtains${showing ? " open" : ""}`} aria-hidden="true">
							<i className="th-curtain l" />
							<i className="th-curtain r" />
						</div>

						{!showing && (
							<div className="th-empty">
								<i className="stars" />
								<i className="moon th-moon" />
								<div className="th-plate">
									{call.peerSharing ? (
										<p className="th-ticket">{them.name} is starting the movie</p>
									) : call.wasSharing ? (
										<>
											<p className="th-ticket">The projector blinked</p>
											<div className="th-cta">
												<button className="btn paper" onClick={share}>
													<Screencast aria-hidden />
													Re-share the movie
												</button>
												<button className="btn glass" onClick={dismissReshare}>
													Not now
												</button>
											</div>
										</>
									) : (
										<>
											<p className="th-ticket">
												Now showing: {me.name} and {them.name}
											</p>
											<TubeStart
												share={
													<button className="btn paper" onClick={share}>
														<Screencast aria-hidden />
														Share a tab
													</button>
												}
											/>
										</>
									)}
								</div>
								<Duo className="th-duo" a={bob("a")} b={bob("b")} />
								<i className="clouds th-clouds" />
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
									<Emoji e={f.emoji} />
								</span>
							))}
						</div>
					</div>

					<div className="th-bar">
						<div className="th-pill">
							<div className="th-reactions" role="group" aria-label="Reactions">
								{REACTIONS.map((e, i) => (
									<button
										key={e}
										className="th-react"
										aria-label={e === FLOWER ? `Float a flower over the movie (key ${i + 1})` : `React ${e} (key ${i + 1})`}
										title={`Key ${i + 1}`}
										onClick={() => react(e)}
									>
										<Emoji e={e} />
									</button>
								))}
							</div>
							{call.peerSharing && !hosting && (
								<label className="th-volume">
									<SpeakerHigh aria-hidden />
									<span>Movie volume</span>
									<input type="range" min={0} max={1} step={0.05} value={volume} onChange={(e) => setVolume(+e.target.value)} />
								</label>
							)}
							{tubeTools && stageTools}
						</div>
						{hosting && (
							<div className="th-share-note">
								<button className="btn sm paper" onClick={stopShare}>
									Stop sharing
								</button>
								<p className="th-hint">
									Your movie plays in its own tab, so stay here with {them.name}. Pause it with the ⏯ key. Sending in{" "}
									{call.peerQuality ? `${call.peerQuality}p` : "Auto"}.
								</p>
							</div>
						)}
						{call.peerSharing && !hosting && <p className="th-hint">You are watching {them.name}'s tab. The sound comes from their side.</p>}
						{talking ? (
							<span className="chip sage th-ptt on" role="status">
								<Microphone aria-hidden />
								Talking
							</span>
						) : (
							<span className="th-ptt">
								Hold <kbd>Space</kbd> to talk
							</span>
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
							<ArrowsOutLineHorizontal aria-hidden />
						</button>
					)}
				</section>

				{tube && <TubeBar room={room} tube={tube} />}
				{!sharing && !tube && (
					<aside className="th-tips" aria-label="Sharing tips">
						<p>Headphones help avoid echo.</p>
						<details>
							<summary>Movie has no sound?</summary>
							<p>Some downloaded .mkv files use AC3 or DTS audio that Chrome cannot play. Convert it once (the picture stays untouched):</p>
							<code className="th-cmd">ffmpeg -i movie.mkv -c:v copy -c:a aac movie.mp4</code>
						</details>
					</aside>
				)}
			</div>

			<ChatDrawer room={room} open={chatOpen} onClose={closeChat} />
			{ending && <EndNightDialog initial={room.picked?.item.title ?? room.tube?.title ?? ""} hosting={hosting} onClose={() => setEnding(false)} />}
		</main>
	);
}

/** Native popover: light-dismiss, Esc and focus handling come free. */
function ViewMenu({ view: v, partnerName }: { view: View; partnerName: string }) {
	return (
		<>
			<button className="btn glass th-tool th-view-btn" popoverTarget="th-view-menu">
				<FrameCorners aria-hidden />
				<span className="th-lbl">View</span>
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
					<input type="checkbox" checked={v.mirrorPartner} onChange={(e) => setView({ mirrorPartner: e.target.checked })} />
					<span>
						Mirror {partnerName}'s camera
						<small>Like your own view</small>
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
				<button className="btn paper th-tap-sound" onClick={unblock}>
					<SpeakerHigh aria-hidden />
					Tap for sound
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
	const sticker = (s: StickerId) => {
		send({ t: "chat", sticker: s });
		setPicker(false);
	};
	const me = profileOf(room, room.you);

	return (
		<aside className={`th-chat${open ? " open" : ""}`} aria-label="Chat" inert={!open} onKeyDown={(e) => e.key === "Escape" && onClose()}>
			<header className="th-chat-head">
				<h2>Whispers</h2>
				<button className="btn icon sm glass" aria-label="Close chat" onClick={onClose}>
					<X aria-hidden />
				</button>
			</header>
			<ol className="th-chat-list" ref={listRef} aria-live="polite">
				{room.chat.length === 0 && (
					<li className="th-chat-empty">
						<span className="th-peek">
							<Duo h="6em" a={{ mood: "bob" }} b={{ mood: "bob" }} />
						</span>
						<p>No whispers yet. Say hi.</p>
					</li>
				)}
				{room.chat.map((m, i) => {
					const p = profileOf(room, m.from);
					const mine = m.from === room.you;
					const first = i === 0 || room.chat[i - 1].from !== m.from;
					const pose = POSES[STICKERS.find((s) => s === m.sticker) ?? "love"];
					return (
						<li key={m.id} className={`th-msg${mine ? " mine" : ""}`}>
							{m.sticker ? (
								<Face who={m.from} ring={p.color} s="5em" rw=".25em" {...pose} label={`${p.name}: ${m.sticker} sticker`} />
							) : (
								<p className="th-msg-text">
									{first && <small className={mine ? "sr-only" : "th-msg-name"}>{p.name}</small>}
									{m.text}
								</p>
							)}
							<time dateTime={new Date(m.at).toISOString()}>{timeOf(m.at)}</time>
						</li>
					);
				})}
			</ol>
			{picker && (
				<div className="th-stickers" role="group" aria-label="Stickers">
					{STICKERS.map((s) => (
						<button key={s} className="th-sticker" aria-label={`Send the ${s} sticker`} title={s} onClick={() => sticker(s)}>
							<Face who={room.you} ring={me.color} s="2.9em" {...POSES[s]} />
						</button>
					))}
				</div>
			)}
			<form className="th-chat-form" onSubmit={submit}>
				<button
					type="button"
					className={`btn icon glass${picker ? " is-on" : ""}`}
					aria-label="Stickers"
					aria-expanded={picker}
					onClick={() => setPicker((p) => !p)}
				>
					<Sticker aria-hidden />
				</button>
				<input
					ref={inputRef}
					className="input"
					value={text}
					onChange={(e) => setText(e.target.value)}
					maxLength={LIMITS.chat}
					placeholder="Whisper something"
					aria-label="Message"
				/>
				<button className="btn icon paper" aria-label="Send" disabled={!text.trim()}>
					<PaperPlaneTilt aria-hidden />
				</button>
			</form>
		</aside>
	);
}

function EndNightDialog({ initial, hosting, onClose }: { initial: string; hosting: boolean; onClose: () => void }) {
	const ref = useRef<HTMLDialogElement>(null);
	const [title, setTitle] = useState(initial);
	// Curtain call first: both bow while flowers rain, then the stub form opens. A click skips the bow.
	const [bowing, setBowing] = useState(true);
	const [raining, setRaining] = useState(true);
	useEffect(() => {
		const bow = setTimeout(() => setBowing(false), matchMedia("(prefers-reduced-motion: reduce)").matches ? 800 : 3400);
		const rain = setTimeout(() => setRaining(false), 5000);
		return () => {
			clearTimeout(bow);
			clearTimeout(rain);
		};
	}, []);
	useEffect(() => {
		const d = ref.current;
		if (!bowing && d && !d.open) d.showModal(); // native modal: focus stays inside, Esc closes
	}, [bowing]);
	const submit = (e: FormEvent) => {
		e.preventDefault();
		const t = title.trim();
		if (!t) return;
		if (hosting) stopShare();
		if (getRoom()?.tube) send({ t: "tube:stop" }); // the YouTube video ends for both of you too
		send({ t: "stub:new", title: t });
		location.hash = "#/memories";
	};
	return (
		<>
			{bowing && (
				<div className="th-bow" onClick={() => setBowing(false)}>
					<div className="th-bow-stage arch">
						<i className="stars" />
						<i className="th-curtain l" />
						<i className="th-curtain r" />
						<Duo h="11em" a={{ moment: "bow-r" }} b={{ moment: "bow-l" }} />
						<i className="clouds th-clouds" />
					</div>
					<p className="th-bow-text" role="status">
						That's a wrap
					</p>
				</div>
			)}
			{raining && <FlowerRain count={20} />}
			<dialog ref={ref} className="th-end" onClose={onClose} aria-labelledby="end-h">
				<form onSubmit={submit}>
					<span className="th-end-peek">
						<Duo h="5.4em" />
					</span>
					<p className="th-end-admit">Admit two</p>
					<h2 id="end-h">That's a wrap</h2>
					<p className="th-end-copy">What did you two watch tonight? We will print a ticket stub for your memories.</p>
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
							<Ticket aria-hidden />
							Print our stub
						</button>
					</div>
				</form>
			</dialog>
		</>
	);
}
