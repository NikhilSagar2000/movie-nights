import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { CornersIn, CornersOut } from "@phosphor-icons/react";
import { other, type Game, type GameKind, type RelayData, type Who } from "../../shared/types";
import { Duo, FlowerRain, Head, type Mood } from "../Character";
import { sameWord } from "../gameLogic";
import { getRoom, onRelay, relay, send, serverNow, sessionId } from "../room";

/* What every game view shares: the context it is handed, small helpers, the shared pieces of UI,
   and the engine for "one knows, one guesses" games (see below). */

export const cls = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(" ");
export const vars = (o: Record<string, string | number>) => o as CSSProperties;
export const ss = {
	get: (k: string) => {
		try {
			return sessionStorage.getItem(k);
		} catch {
			return null;
		}
	},
	set: (k: string, v: string) => {
		try {
			sessionStorage.setItem(k, v);
		} catch {
			/* private mode: the secret just won't survive a refresh */
		}
	},
};

/** Everything a game view needs about the room and the current game. */
export type Ctx = {
	game: Game;
	you: Who;
	them: Who;
	/** Partner is here; moves are disabled otherwise. */
	live: boolean;
	partnerSid?: string;
	name: (w: Who) => string;
	color: (w: Who) => string;
	/** Who has locked in for the current sealed round. */
	locked: Who[];
	seal: (answer: string) => void;
	again: () => void;
};

/** "You" for you, their name for them. */
export const who = (c: Ctx, w: Who) => (w === c.you ? "You" : c.name(w));

export function Away({ who, name }: { who: Who; name: string }) {
	return (
		<div className="gm-away" role="status">
			<span className="gm-away-peek">
				<Head who={who} mood="away" h="4.4em" />
			</span>
			<p>
				<b>{name} is away right now.</b> Games wait until you are both here.
			</p>
		</div>
	);
}

/** Full screen for a game, the Theater's way: the whole page goes full screen (so the cams and nudges stay on top) and
 *  the game's screen covers it ("is-full", see games.css). Where only videos can go full screen (iPhones) it just covers
 *  the window. Esc or the browser's own exit comes back through fullscreenchange; leaving the game leaves full screen.
 *  "was-full" plays the way back in, and the page's scroll is put back where it was. */
export function useFull() {
	const [full, setFull] = useState<"" | "is-full" | "was-full">("");
	const y = useRef(0);
	useEffect(() => {
		const sync = () => !document.fullscreenElement && setFull((f) => (f === "is-full" ? "was-full" : f));
		document.addEventListener("fullscreenchange", sync);
		return () => {
			document.removeEventListener("fullscreenchange", sync);
			if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
		};
	}, []);
	useLayoutEffect(() => {
		if (full === "was-full") scrollTo(0, y.current);
	}, [full]);
	const toggle = () => {
		if (full !== "is-full") {
			y.current = scrollY;
			setFull("is-full");
			if (document.fullscreenEnabled) void document.documentElement.requestFullscreen().catch(() => {});
		} else if (document.fullscreenElement) void document.exitFullscreen();
		else setFull("was-full");
	};
	return [full, toggle] as const;
}

/** The same button both ways, so focus stays on it. `icon`: just the corners (the Solo frame's row of icon buttons). */
export function FullButton({ full, toggle, icon }: { full: string; toggle: () => void; icon?: boolean }) {
	const label = full === "is-full" ? "Exit full screen" : "Full screen";
	return (
		<button className={cls("btn paper sm gm-fs", icon && "icon")} aria-label={icon ? label : undefined} title={icon ? label : undefined} onClick={toggle}>
			{full === "is-full" ? <CornersIn aria-hidden /> : <CornersOut aria-hidden />}
			{!icon && label}
		</button>
	);
}

/** Flowers fall across the screen for a few seconds. Portaled so an animated ancestor can't trap the fixed flowers. */
export function Rain() {
	const [on, setOn] = useState(true);
	useEffect(() => {
		const t = setTimeout(() => setOn(false), 5000);
		return () => clearTimeout(t);
	}, []);
	return on
		? createPortal(
				<div className="gm-rain" aria-hidden="true">
					<FlowerRain count={14} />
				</div>,
				document.body,
			)
		: null;
}

/** End of a round: the heads hop (or `sad` goes aww), flowers fall, and one button carries on. */
export function Finish({ text, sub, button, onNext, sad }: { text: string; sub?: string; button: string; onNext: () => void; sad?: boolean }) {
	const mood: Mood = sad ? "aww" : "hop";
	return (
		<div className="gm-done" role="status">
			{!sad && <Rain />}
			<span className="gm-done-heads">
				<Duo h="7em" together={!sad} className="gm-duo" a={{ mood }} b={{ mood }} />
			</span>
			<div className="gm-done-copy">
				<h2>{text}</h2>
				{sub && <p>{sub}</p>}
				<button className="btn" onClick={onNext}>
					{button}
				</button>
			</div>
		</div>
	);
}

// ================= "One knows, one guesses" =================
// Each round has a lead: the one who knows the answer (or describes, acts, sings). Their browser is the only one that
// holds the secret (sessionStorage, keyed by game + round), so the guesser's browser never receives it before the reveal.
// The guesser's moves travel as relayed plays; the lead's browser applies them. Every write carries the rev it was
// built on and the Room drops stale ones, so a late write can't undo a newer round.

/** Fields every lead game's state has. `acks` = ids of the guesser's plays already applied (so a re-send is ignored). */
export type Base = { lead: Who; starter: Who; round: number; acks: string[] };
export type Play = Extract<RelayData, { k: "play" }>;

let mine: { id: string; rev: number; state: unknown } | null = null; // my last write, until the Room echoes it
/** Write the next state: `fn` gets the newest state (mine if my last write hasn't come back yet) and returns the next one, or null. */
export function commit<S>(game: Game, fn: (s: S) => S | null) {
	const now = getRoom()?.game;
	const g = now && now.id === game.id ? now : game; // a handler or timer may hold an older copy: always build on the newest
	const rev = g.rev ?? 0;
	const pending = mine && mine.id === g.id && mine.rev > rev ? mine : null;
	const next = fn((pending ? pending.state : g.state) as S);
	if (!next) return;
	const base = pending ? pending.rev : rev;
	mine = { id: g.id, rev: base + 1, state: next };
	send({ t: "game:state", id: g.id, rev: base, state: next });
}

/** Starts the next round with the other person leading (or `lead`, e.g. the same one after a redraw). */
export function nextRound<S extends Base>(g: Game, fresh: (b: Base) => S, lead?: Who) {
	commit<S>(g, (s) => fresh({ lead: lead ?? other(s.lead), starter: s.starter, round: s.round + 1, acks: [] }));
}

// ---- plays: guesser → lead ----
type Apply = (s: never, play: Play, g: Game) => unknown;
const appliers: Partial<Record<GameKind, Apply>> = {};
/** Registers how a game's lead applies a guesser's play; return the next state, or null to ignore it. */
export function onPlay<S extends Base>(kind: GameKind, apply: (s: S, play: Play, g: Game) => S | null) {
	appliers[kind] = apply as Apply;
}
// Module level, so the lead applies plays even while on another page.
const stopPlays = onRelay((from, d) => {
	if (d.k !== "play") return;
	const room = getRoom();
	const g = room?.game;
	const apply = g && appliers[g.kind];
	if (!room || !g || !apply || d.id !== g.id || from === room.you) return;
	commit<Base>(g, (s) => {
		if (!s || s.lead !== room.you || s.round !== d.round || s.acks.includes(d.pid)) return null;
		const next = apply(s as never, d, g) as Base | null;
		return next && { ...next, acks: [...s.acks, d.pid].slice(-12) };
	});
});
import.meta.hot?.dispose(stopPlays);

let playSeq = 0;
let outbox: Play[] = []; // my plays this round the lead hasn't applied yet (re-sent if they reconnect)
/** Sends a play to the lead. */
export function sendPlay(g: Game, round: number, act: string, v?: string | number) {
	const play: Play = { k: "play", id: g.id, round, pid: `${sessionId.slice(0, 8)}:${++playSeq}`, act, v };
	outbox = [...outbox.filter((p) => p.id === g.id && p.round === round), play];
	relay(play);
}
/** Called when the partner (re)connects: anything they never applied goes again. */
export function resendPlays(g: Game) {
	const s = g.state as Base | null;
	outbox = outbox.filter((p) => p.id === g.id && s && p.round === s.round && !s.acks.includes(p.pid));
	outbox.forEach((p) => relay(p));
}

// ---- secrets and cards ----
const seenKey = (deck: string) => `seen:${deck}`;
/** Picks a random card the device hasn't drawn lately (the list resets once most of the deck has been seen). */
export function draw<T>(deck: string, cards: T[], key: (c: T) => string): T {
	let seen: string[] = [];
	try {
		seen = JSON.parse(localStorage.getItem(seenKey(deck)) ?? "[]");
	} catch {
		/* start fresh */
	}
	let pool = cards.filter((c) => !seen.includes(key(c)));
	if (pool.length < Math.max(3, cards.length * 0.1)) {
		seen = [];
		pool = cards;
	}
	const card = pool[Math.floor(Math.random() * pool.length)];
	try {
		localStorage.setItem(seenKey(deck), JSON.stringify([...seen, key(card)]));
	} catch {
		/* no storage: repeats are possible */
	}
	return card;
}

/** The lead's secret for a round: read from this tab, or drawn and kept there (survives a refresh, never sent).
 *  Plain function, so the play appliers can use it while the game screen isn't even mounted. */
export function secretFor<T>(g: Game, slot: string | number, pick: () => T): T {
	const key = `${g.id}:${slot}`;
	try {
		const saved = ss.get(key);
		if (saved) return JSON.parse(saved) as T;
	} catch {
		/* corrupt: draw again */
	}
	const value = pick();
	ss.set(key, JSON.stringify(value));
	return value;
}
/** The secret in a view: null for the guesser. `slot` defaults to the round (Charades adds its passes to it). */
export function useSecret<T>(c: Ctx, s: Base, pick: () => T, slot: string | number = s.round): T | null {
	const leading = s.lead === c.you;
	return useMemo(() => (leading ? secretFor(c.game, slot, pick) : null), [c.game.id, slot, leading]);
}

/** Seconds left until `endsAt` (Room clock), ticking; null without a deadline. */
export function useCountdown(endsAt: number | undefined) {
	const [, tick] = useState(0);
	useEffect(() => {
		if (!endsAt) return;
		const t = setInterval(() => tick((n) => n + 1), 250);
		return () => clearInterval(t);
	}, [endsAt]);
	return endsAt ? Math.max(0, Math.ceil((endsAt - serverNow()) / 1000)) : null;
}

/** When a round's clock runs out: the lead writes `finish` straight away; the guesser does it 3 s later only if the
 *  lead hasn't (they may be away or on another page). The rev check makes sure only one of the two writes lands. */
export function useTimeUp<S extends Base & { endsAt?: number }>(c: Ctx, s: S, running: boolean, finish: (st: S) => S | null) {
	const fin = useRef(finish);
	fin.current = finish;
	const leading = s.lead === c.you;
	useEffect(() => {
		if (!running || !s.endsAt) return;
		const wait = Math.max(0, s.endsAt - serverNow()) + (leading ? 0 : 3000);
		const t = setTimeout(() => commit<S>(c.game, (st) => (st.round === s.round && st.endsAt === s.endsAt ? fin.current(st) : null)), wait);
		return () => clearTimeout(t);
	}, [running, s.endsAt, s.round, leading, c.game.id]);
}

/** A ring that empties as the round runs out. */
export function Timer({ left, total }: { left: number | null; total: number }) {
	if (left === null) return null;
	return (
		<span className={cls("gm-timer", left <= 10 && "low")} role="timer" aria-label={`${left} seconds left`} style={vars({ "--p": left / total })}>
			{left}
		</span>
	);
}

/** True for a moment after `key` changes (never on first render). */
export function useFlash(key: unknown, ms = 1400) {
	const seen = useRef(key);
	const [on, setOn] = useState(false);
	useEffect(() => {
		if (Object.is(seen.current, key)) return;
		seen.current = key;
		setOn(true);
		const t = setTimeout(() => setOn(false), ms);
		return () => clearTimeout(t);
	}, [key, ms]);
	return on;
}

/** Does a typed guess name this card (its name or any common alias)? */
export const named = (guess: string, name: string, aka: string[] = []) => [name, ...aka].some((n) => sameWord(guess, n));
