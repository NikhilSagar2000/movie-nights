// The one contract between the browser and the Room Durable Object.

import type { Look, Looks } from "./look";

export type Who = "a" | "b";
export const PEOPLE: Who[] = ["a", "b"];
export const other = (w: Who): Who => (w === "a" ? "b" : "a");

export type Profile = { name: string; color: string };
export type Profiles = Partial<Record<Who, Profile>>;

export type ChatMsg = { id: string; from: Who; text?: string; sticker?: string; at: number };
export type JarItem = { id: string; title: string; addedBy: Who };
export type Stub = {
	id: string;
	title: string;
	date: string; // ISO date
	hearts: Partial<Record<Who, number>>; // 1-5
	notes: Partial<Record<Who, string>>;
};

/** A letter left for the other person ("Leave a note"). `openedAt` is set when the recipient opens it. */
export type LetterPaper = "cream" | "mist" | "blush";
export const PAPERS: LetterPaper[] = ["cream", "mist", "blush"];
export type Letter = { id: string; from: Who; text: string; paper: LetterPaper; at: number; openedAt?: number };

/** Listen together: one YouTube video playing in sync (plus a queue). `pos` seconds at Room time `at`. */
export type TubeItem = { key: string; id: string; title: string; by: Who };
export type Tube = TubeItem & { playing: boolean; pos: number; at: number; queue: TubeItem[] };

/** Our little tuberose: points from time spent together (the Room hands them out, capped per day). */
export type Garden = { pts: number };

export type GameKind = "mindmeld" | "whoami" | "taboo" | "charades" | "emoji" | "antakshari" | "wave";
export type Reveal = Record<Who, string>;
/** The server never interprets `state`; it only stores it. Sealed-answer games read `reveals`.
 *  `rev` counts accepted writes: a `game:state` built on an older rev is dropped, so a late write can't undo a newer one. */
export type Game = { id: string; kind: GameKind; state: unknown; reveals: Reveal[]; rev?: number };
/** Which players have locked in an answer for the current sealed round (answers stay server-side). */
export type Sealed = { round: number; submitted: Who[] };

export type Peer = { who: Who; sid: string };

// Ephemeral messages the Room forwards to the other person without reading or storing them.
// Structural copies of the DOM WebRTC types, so the worker (no DOM lib) can compile this file too.
type SdpInit = { type: "offer" | "answer" | "pranswer" | "rollback"; sdp?: string };
type IceInit = { candidate?: string; sdpMid?: string | null; sdpMLineIndex?: number | null; usernameFragment?: string | null };
export type RelayData =
	/** `pcid` names one connection attempt, so answers and candidates from an older attempt are ignored. */
	| { k: "signal"; sid: string; pcid: string; description?: SdpInit; candidate?: IceInit | null }
	/** Sent when someone walks through the door: their call is listening now, so the other side should (re)offer. */
	| { k: "ready"; sid: string }
	| { k: "share"; on: boolean }
	/** My cam/mic switches, so the partner can show a teddy instead of black frames, and a muted badge. */
	| { k: "av"; cam: boolean; mic: boolean }
	/** The resolution this person wants to RECEIVE (null = auto); the sharer encodes to match. */
	| { k: "quality"; height: 480 | 720 | 1080 | 1440 | null }
	| { k: "react"; emoji: string; x: number }
	/** "boop" is the poke (the name on the wire stays, so tabs opened before the rename still understand it). */
	| { k: "nudge"; kind: "pause" | "flower" | "boop" }
	/** A guesser's move in a "one knows, one guesses" game, applied by the lead's browser (the only one that knows the answer). */
	| { k: "play"; id: string; round: number; pid: string; act: string; v?: string | number }
	/** "Play a movie file": the laptop with the file says what's playing (null = stopped). */
	| { k: "film"; film: FilmState | null }
	/** The subtitle line on screen right now ("" = none). */
	| { k: "film:sub"; text: string }
	/** The partner's buttons, applied by the laptop with the file. `i` = the episode they saw, so a doubled "next" skips once. */
	| { k: "film:do"; act: FilmAct; pos?: number; i?: number };

export type FilmAct = "play" | "pause" | "seek" | "next" | "stay";
/** `i` = episode index; `playing` = not paused (`buffering`: but stalled right now); `by` = who last played or paused it;
 *  `nextIn` = seconds left on the "Next episode" card (null = no card). */
export type FilmState = {
	i: number;
	title: string;
	pos: number;
	dur: number;
	playing: boolean;
	buffering: boolean;
	by: Who | null;
	next: string | null;
	nextIn: number | null;
	subs: boolean;
};

/** The solo arcade games (ids match src/arcade/index.ts). Scores are higher-is-better, except the times in SOLO_LOW. */
export const SOLO_GAMES = ["popcorn", "lantern", "stack", "run", "swat", "snake", "bloom", "bricks", "mines", "jumble"] as const;
export type SoloGame = (typeof SOLO_GAMES)[number];
export const SOLO_LOW: readonly SoloGame[] = ["mines"];
/** Games with modes keep a best per mode (Minesweeper's board sizes). */
export const SOLO_MODES: Partial<Record<SoloGame, readonly string[]>> = { mines: ["s", "m", "l"] };
/** "They beat your Snake best": waits for `to` until they've seen it. `key` is the game, or "game:mode" ("mines:s"). */
export type BeatNote = { key: string; by: Who; score: number; yours: number; at: number };
/** Each person's best per game key, and the beat notes waiting for each of them. */
export type Bests = { scores: Record<Who, Record<string, number>>; notes: Record<Who, BeatNote[]> };

export type ClientMsg =
	| { t: "relay"; data: RelayData }
	| { t: "profile"; profile: Profile }
	| { t: "chat"; text?: string; sticker?: string }
	| { t: "jar:add"; title: string }
	| { t: "jar:remove"; id: string }
	| { t: "jar:shake" }
	| { t: "stub:new"; title: string }
	| { t: "stub:rate"; id: string; hearts: number; note: string }
	| { t: "stub:delete"; id: string }
	| { t: "letter:send"; text: string; paper: LetterPaper }
	| { t: "letter:open"; id: string }
	| { t: "tube:load"; id: string }
	| { t: "tube:queue"; id: string }
	| { t: "tube:unqueue"; key: string }
	| { t: "tube:play"; pos: number }
	| { t: "tube:pause"; pos: number }
	| { t: "tube:seek"; pos: number }
	| { t: "tube:ended"; key: string }
	| { t: "tube:skip" }
	| { t: "tube:stop" }
	| { t: "game:new"; kind: GameKind; state: unknown }
	| { t: "game:state"; id: string; rev: number; state: unknown }
	| { t: "game:end" }
	| { t: "seal"; gameId: string; round: number; answer: string }
	| { t: "best"; key: string; score: number }
	| { t: "best:seen" }
	/** Your own look (dress up). Stored under the sender, never the partner. */
	| { t: "look"; look: Look };

export type Snapshot = {
	you: Who;
	/** The Room's clock when it sent this, so timers agree across devices. */
	now: number;
	online: Peer[];
	profiles: Profiles;
	chat: ChatMsg[];
	jar: JarItem[];
	stubs: Stub[];
	letters: Letter[];
	tube: Tube | null;
	garden: Garden;
	game: Game | null;
	sealed: Sealed | null;
	bests: Bests;
	looks: Looks;
};

export type ServerMsg =
	| ({ t: "init" } & Snapshot)
	| { t: "presence"; online: Peer[] }
	| { t: "relay"; from: Who; data: RelayData }
	| { t: "profiles"; profiles: Profiles }
	| { t: "chat"; msg: ChatMsg }
	| { t: "jar"; jar: JarItem[] }
	| { t: "jar:picked"; item: JarItem; by: Who }
	| { t: "stubs"; stubs: Stub[] }
	| { t: "letters"; letters: Letter[] }
	| { t: "tube"; tube: Tube | null }
	| { t: "garden"; garden: Garden }
	| { t: "game"; game: Game | null }
	| { t: "sealed"; sealed: Sealed | null }
	| { t: "bests"; bests: Bests }
	| { t: "looks"; looks: Looks };

// Input limits, enforced by the Room (trust boundary) and mirrored in the UI.
export const LIMITS = { name: 24, chat: 1000, title: 120, note: 400, answer: 40, relayBytes: 64_000, chatKeep: 200, letter: 800, lettersKeep: 200, tubeQueue: 30 };
