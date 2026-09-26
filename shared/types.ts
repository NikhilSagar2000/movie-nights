// The one contract between the browser and the Room Durable Object.

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

export type GameKind = "ttt" | "c4" | "memory" | "rps" | "mindmeld" | "doodle";
export type Reveal = Record<Who, string>;
/** The server never interprets `state`; it only stores it. Sealed-answer games read `reveals`. */
export type Game = { id: string; kind: GameKind; state: unknown; reveals: Reveal[] };
/** Which players have locked in an answer for the current sealed round (answers stay server-side). */
export type Sealed = { round: number; submitted: Who[] };

export type Peer = { who: Who; sid: string };

// Ephemeral messages the Room forwards to the other person without reading or storing them.
export type Stroke = { x: number[]; y: number[]; color: string; size: number }; // 0..1 coords
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
	| { k: "nudge"; kind: "pause" | "flower" | "boop" }
	| { k: "doodle"; strokes: Stroke[] }
	| { k: "doodle:clear" }
	| { k: "doodle:guess"; text: string };

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
	| { t: "game:new"; kind: GameKind; state: unknown }
	| { t: "game:state"; id: string; state: unknown }
	| { t: "game:end" }
	| { t: "seal"; gameId: string; round: number; answer: string };

export type Snapshot = {
	you: Who;
	online: Peer[];
	profiles: Profiles;
	chat: ChatMsg[];
	jar: JarItem[];
	stubs: Stub[];
	game: Game | null;
	sealed: Sealed | null;
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
	| { t: "game"; game: Game | null }
	| { t: "sealed"; sealed: Sealed | null };

// Input limits, enforced by the Room (trust boundary) and mirrored in the UI.
export const LIMITS = { name: 24, chat: 1000, title: 120, note: 400, answer: 40, relayBytes: 64_000, chatKeep: 200 };
