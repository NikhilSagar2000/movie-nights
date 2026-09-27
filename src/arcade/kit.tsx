import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import type { Who } from "../../shared/types";
import { isTyping } from "../Theater";

/* The small toolkit every solo game shares: what a game is handed, a frame loop, a scaled canvas,
   keys and swipes, the palette, and best scores. Solo games are local only: nothing here talks to the Room. */

/** What the Solo frame hands a game. `end(null)` = the run doesn't count (a lost Minesweeper board). */
export type SoloApi = {
	paused: boolean;
	you: Who;
	/** The chosen mode (e.g. the Minesweeper board size), for games that have modes. */
	mode?: string;
	setScore: (n: number) => void;
	end: (score: number | null, note?: string) => void;
};
export type Dir = "up" | "down" | "left" | "right";

export const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
export const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

/** Runs `step(dt)` every frame while `running`. dt is in seconds and capped at 50 ms, so a stutter can't tunnel a ball through a wall. */
export function useLoop(step: (dt: number) => void, running: boolean) {
	const fn = useRef(step);
	useEffect(() => {
		fn.current = step;
	});
	// a layout effect: on unmount the loop stops before React lets go of the game's refs, so no last frame hits null
	useLayoutEffect(() => {
		if (!running) return;
		let raf = 0;
		let last = performance.now();
		const tick = (t: number) => {
			fn.current(Math.min(0.05, (t - last) / 1000));
			last = t;
			raf = requestAnimationFrame(tick);
		};
		raf = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(raf);
	}, [running]);
}

/** A canvas drawn in a fixed w×h coordinate space, scaled to its CSS size (device pixel ratio capped at 2).
 *  `draw` runs after every resize too, so a paused game never goes blank. Returns the ref, the context getter and a
 *  function that turns a pointer event into game coordinates. */
export function useCanvas(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
	const ref = useRef<HTMLCanvasElement>(null);
	const ctx = useRef<CanvasRenderingContext2D | null>(null);
	const paint = useRef(draw);
	useEffect(() => {
		paint.current = draw;
	});
	useEffect(() => {
		const c = ref.current!;
		const fit = () => {
			const r = c.getBoundingClientRect();
			const dpr = Math.min(2, devicePixelRatio || 1);
			c.width = Math.max(1, Math.round(r.width * dpr));
			c.height = Math.max(1, Math.round(r.height * dpr));
			const g = c.getContext("2d")!;
			g.setTransform(c.width / w, 0, 0, c.height / h, 0, 0);
			ctx.current = g;
			paint.current(g);
		};
		fit();
		const ro = new ResizeObserver(fit);
		ro.observe(c);
		return () => ro.disconnect();
	}, [w, h]);
	const at = (e: { clientX: number; clientY: number }) => {
		const r = ref.current!.getBoundingClientRect();
		return { x: ((e.clientX - r.left) / r.width) * w, y: ((e.clientY - r.top) / r.height) * h };
	};
	/** Draw now (call at the end of each step). */
	const redraw = () => ctx.current && paint.current(ctx.current);
	return { ref, at, redraw };
}

let colors: Record<string, string> | null = null;
/** The Blue Hour tokens from :root, read once. */
export function palette() {
	if (colors) return colors;
	const css = getComputedStyle(document.documentElement);
	const names = ["haze", "fog", "mist", "steel", "dusk", "night", "cream", "paper", "blush", "flower", "rosewood", "rose-ink", "sage", "ink-soft"];
	colors = Object.fromEntries(names.map((n) => [n, css.getPropertyValue(`--${n}`).trim()]));
	return colors;
}

const keyOf = (e: KeyboardEvent) => (e.key.length === 1 ? e.key.toLowerCase() : e.key);
/** A window key handler while `active`. Return true from `on` for keys you handled: they won't scroll the page.
 *  Skipped while typing in a field, or with meta/ctrl/alt held (browser shortcuts stay browser shortcuts). */
export function useKeys(on: (key: string, e: KeyboardEvent) => boolean | void, active = true) {
	const fn = useRef(on);
	useEffect(() => {
		fn.current = on;
	});
	useEffect(() => {
		if (!active) return;
		const down = (e: KeyboardEvent) => {
			if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
			if (fn.current(keyOf(e), e)) e.preventDefault();
		};
		addEventListener("keydown", down);
		return () => removeEventListener("keydown", down);
	}, [active]);
}

/** Which of `keys` are held down right now (for smooth left/right movement). */
export function useHeld(keys: string[]) {
	const held = useRef(new Set<string>());
	useEffect(() => {
		const down = (e: KeyboardEvent) => {
			const k = keyOf(e);
			if (!keys.includes(k) || isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
			e.preventDefault();
			held.current.add(k);
		};
		const up = (e: KeyboardEvent) => held.current.delete(keyOf(e));
		const clear = () => held.current.clear();
		addEventListener("keydown", down);
		addEventListener("keyup", up);
		addEventListener("blur", clear);
		return () => {
			removeEventListener("keydown", down);
			removeEventListener("keyup", up);
			removeEventListener("blur", clear);
		};
	}, []);
	return held;
}

/** Arrow keys and WASD as directions. */
export const DIR_KEYS: Record<string, Dir> = {
	ArrowUp: "up",
	ArrowDown: "down",
	ArrowLeft: "left",
	ArrowRight: "right",
	w: "up",
	s: "down",
	a: "left",
	d: "right",
};

/** Calls `onDir` when a finger (or mouse) swipes across `el` by at least 24px. The element needs `touch-action: none`. */
export function useSwipe(el: RefObject<HTMLElement | null>, onDir: (d: Dir) => void, active = true) {
	const fn = useRef(onDir);
	useEffect(() => {
		fn.current = onDir;
	});
	useEffect(() => {
		const node = el.current;
		if (!node || !active) return;
		let start: { x: number; y: number; id: number } | null = null;
		const down = (e: PointerEvent) => {
			start = { x: e.clientX, y: e.clientY, id: e.pointerId };
		};
		const move = (e: PointerEvent) => {
			if (e.pointerType === "mouse" && !e.buttons) return void (start = null); // let go outside the element: hovering isn't a swipe
			if (!start || e.pointerId !== start.id) return;
			const dx = e.clientX - start.x;
			const dy = e.clientY - start.y;
			if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
			fn.current(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up");
			start = null; // one swipe per touch
		};
		const up = () => (start = null);
		node.addEventListener("pointerdown", down);
		node.addEventListener("pointermove", move);
		node.addEventListener("pointerup", up);
		node.addEventListener("pointercancel", up);
		return () => {
			node.removeEventListener("pointerdown", down);
			node.removeEventListener("pointermove", move);
			node.removeEventListener("pointerup", up);
			node.removeEventListener("pointercancel", up);
		};
	}, [el, active]);
}

// best scores live with the game list (the hub shows them without loading this file)
export { bestKey, fmt, readBest, saveBest } from "./index";
