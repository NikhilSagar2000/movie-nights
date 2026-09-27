import { lazy, useEffect, useState, type ComponentType, type LazyExoticComponent } from "react";
import { SOLO_LOW, type SoloGame, type Who } from "../../shared/types";
import { better, gameOf, NO_BESTS } from "../../shared/bests";
import { send, type RoomState } from "../room";
import type { SoloApi } from "./kit";

/* The solo games: little arcade games for one. Only this list, the hub cards and the frame are in the main bundle;
   each game (and its CSS) loads on demand when opened. */

export type SoloMeta = {
	name: string;
	blurb: string;
	/** The hub card's big emoji. */
	art: string;
	/** Card colour. */
	tone: "cream" | "night" | "blush" | "sage";
	/** The controls, under the stage. */
	hint: string;
	/** Real-time games wait for "tap to start", and can pause. */
	realtime?: boolean;
	/** Letters are typed in play, so P doesn't pause (Esc and the button still do). */
	typing?: true;
	/** Lower is better (times). */
	low?: boolean;
	unit?: "time";
	modes?: { id: string; label: string }[];
	/** Width ÷ height of the stage (default 1, a square). */
	aspect?: number;
	View: LazyExoticComponent<ComponentType<{ api: SoloApi }>>;
};

export const SOLO = {
	popcorn: {
		name: "Popcorn Catch",
		blurb: "Catch the popcorn, dodge the burnt bits",
		art: "🍿",
		tone: "cream",
		hint: "Drag or move the mouse (←/→ or A/D work too). A tuberose is worth 5.",
		realtime: true,
		aspect: 3 / 4,
		View: lazy(() => import("./Popcorn")),
	},
	lantern: {
		name: "Sky Lantern",
		blurb: "Tap to float a Diwali lantern past the rooftops",
		art: "🏮",
		tone: "night",
		hint: "Tap, click, Space or ↑ to lift the lantern.",
		realtime: true,
		aspect: 3 / 4,
		View: lazy(() => import("./Lantern")),
	},
	stack: {
		name: "Ladoo Stack",
		blurb: "Drop the mithai boxes. How high can it go?",
		art: "🎁",
		tone: "blush",
		hint: "Tap, click or Space to drop. Whatever hangs over falls off.",
		realtime: true,
		aspect: 3 / 4,
		View: lazy(() => import("./Stack")),
	},
	run: {
		name: "Rooftop Run",
		blurb: "Run the rooftops at night. Jump the water tanks",
		art: "🌙",
		tone: "night",
		hint: "Tap, Space or ↑ to jump. Hold it to jump higher.",
		realtime: true,
		aspect: 16 / 9,
		View: lazy(() => import("./Rooftop")),
	},
	swat: {
		name: "Mosquito Swat",
		blurb: "Swat the mosquitoes. Spare the tuberose",
		art: "🦟",
		tone: "sage",
		hint: "Tap or click them. Keys 1–9 match the grid, like a number pad.",
		realtime: true,
		View: lazy(() => import("./Swat")),
	},
	snake: {
		name: "Snake",
		blurb: "The Nokia classic. Eat popcorn, don't bite your tail",
		art: "🐍",
		tone: "sage",
		hint: "Arrow keys, WASD or swipe. It speeds up every 5 bites.",
		realtime: true,
		View: lazy(() => import("./Snake")),
	},
	bloom: {
		name: "Bloom 2048",
		blurb: "Slide and merge flowers into a bouquet",
		art: "🌸",
		tone: "blush",
		hint: "Arrow keys, WASD or swipe. Two alike make the next flower.",
		View: lazy(() => import("./Bloom")),
	},
	bricks: {
		name: "Brick Breaker",
		blurb: "Bounce the ball, break the wall",
		art: "🧱",
		tone: "cream",
		hint: "Drag or move the mouse (←/→ or A/D work too). Tap or Space to launch. Catch a tuberose for an extra ball.",
		realtime: true,
		aspect: 3 / 4,
		View: lazy(() => import("./Bricks")),
	},
	mines: {
		name: "Minesweeper",
		blurb: "The old Windows classic",
		art: "🚩",
		tone: "night",
		hint: "Tap to open. Right-click, long-press or Flag mode to flag. Tap a number to open around it. Arrows, Enter and F work too.",
		low: true,
		unit: "time",
		aspect: 0.88,
		modes: [
			{ id: "s", label: "Small" },
			{ id: "m", label: "Medium" },
			{ id: "l", label: "Big" },
		],
		View: lazy(() => import("./Mines")),
	},
	jumble: {
		name: "Jumble",
		blurb: "Unscramble as many words as you can in a minute",
		art: "🔤",
		tone: "cream",
		hint: "Tap the letters or type them. Backspace takes one back.",
		realtime: true,
		typing: true,
		View: lazy(() => import("./Jumble")),
	},
} satisfies Record<SoloGame, SoloMeta>;

export type SoloId = keyof typeof SOLO;
export const SOLO_IDS = Object.keys(SOLO) as SoloId[];
export const soloMeta = (id: SoloId): SoloMeta => SOLO[id];

/** The open solo game from the address ("#/games/snake"), or null on the hub. */
export function useSoloRoute(): SoloId | null {
	const read = () => {
		const id = location.hash.replace(/^#\/?/, "").split("/")[1];
		return id && id in SOLO ? (id as SoloId) : null;
	};
	const [id, setId] = useState(read);
	useEffect(() => {
		const on = () => setId(read());
		addEventListener("hashchange", on);
		return () => removeEventListener("hashchange", on);
	}, []);
	return id;
}

// ---------- best scores: the Room keeps both of yours (you each see the other's), with a copy on this device ----------
/** A best's key: the game, plus the mode for games with modes ("mines:s"). */
export const bestKey = (id: string, mode?: string) => (mode ? `${id}:${mode}` : id);
const localKey = (who: Who, key: string) => `best:${who}:${key}`;
function readLocal(k: string): number | null {
	try {
		const v = localStorage.getItem(k);
		const n = v === null ? NaN : Number(v);
		return Number.isFinite(n) && n >= 0 && n <= 1e7 ? n : null; // what the Room would take
	} catch {
		return null;
	}
}
function writeLocal(k: string, n: number) {
	try {
		localStorage.setItem(k, String(n));
	} catch {
		/* no storage: the Room still has it */
	}
}
const roomScores = (room: RoomState) => (room.bests ?? NO_BESTS).scores;

/** Someone's best: the Room's, or (for you) this device's copy when it's better (set offline, not sent yet). */
export function bestOf(room: RoomState, who: Who, key: string): number | null {
	const game = gameOf(key);
	const kept = roomScores(room)[who]?.[key];
	const here = who === room.you ? readLocal(localKey(who, key)) : null;
	if (!game || here === null) return kept ?? null;
	return better(game, here, kept) ? here : kept!;
}
/** A new best of yours: kept here and sent to the Room (which keeps it only if it really beats your last). */
export function saveBest(who: Who, key: string, n: number) {
	writeLocal(localKey(who, key), n);
	send({ t: "best", key, score: n });
}
/** Once per connection: bests on this device that the Room doesn't have yet go up. Bests from before the Room kept
 *  them ("best:snake", no person) belong to whoever uses this browser, so they become yours. */
export function syncBests(room: RoomState) {
	let keys: string[] = [];
	try {
		keys = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)!).filter((k) => k.startsWith("best:"));
	} catch {
		return;
	}
	for (const k of keys) {
		const rest = k.slice(5);
		const legacy = !/^[ab]:/.test(rest);
		const who: Who = legacy ? room.you : (rest[0] as Who);
		const key = legacy ? rest : rest.slice(2);
		const game = gameOf(key);
		const n = readLocal(k);
		if (!game || n === null || who !== room.you) continue;
		if (legacy) {
			try {
				localStorage.removeItem(k);
			} catch {
				/* read-only storage: it just stays */
			}
			const cur = readLocal(localKey(who, key));
			if (cur === null || better(game, n, cur)) writeLocal(localKey(who, key), n);
		}
		if (better(game, n, roomScores(room)[who]?.[key]) && (n > 0 || SOLO_LOW.includes(game))) send({ t: "best", key, score: n });
	}
}
/** A score for display: seconds as m:ss for timed games, else the number. */
export const fmt = (n: number, unit?: "time") => (unit === "time" ? `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, "0")}` : String(n));
