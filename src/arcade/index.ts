import { lazy, useEffect, useState, type ComponentType, type LazyExoticComponent } from "react";
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
} satisfies Record<string, SoloMeta>;

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

// ---------- best scores (this browser only) ----------
export const bestKey = (id: string, mode?: string) => `best:${id}${mode ? ":" + mode : ""}`;
export function readBest(key: string): number | null {
	try {
		const v = localStorage.getItem(key);
		return v === null ? null : Number(v);
	} catch {
		return null;
	}
}
export function saveBest(key: string, n: number) {
	try {
		localStorage.setItem(key, String(n));
	} catch {
		/* no storage: the best just isn't remembered */
	}
}
/** A score for display: seconds as m:ss for timed games, else the number. */
export const fmt = (n: number, unit?: "time") => (unit === "time" ? `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, "0")}` : String(n));
