import type { Who } from "../../../shared/types";

/* Popcorn Catch: things fall from the top, the head at the bottom catches them. Pure: the view feeds it time and
   where the head's catch box is; it answers with the new state and what was caught. */

export const W = 360;
export const H = 480;
/** Where the head stands (its bottom edge). */
export const FLOOR = 466;
/** Her drawn height; his is 0.785 of it (the sprite viewBoxes: her 51.4×78.1, him 59.2×61.3, same drawing scale). */
export const HEAD_H = 84;
export const HEAD: Record<Who, { w: number; h: number }> = {
	a: { w: HEAD_H * 0.785 * (59.2 / 61.3), h: HEAD_H * 0.785 },
	b: { w: HEAD_H * (51.4 / 78.1), h: HEAD_H },
};

export type Kind = "pop" | "rose" | "burnt";
export type Item = { kind: Kind; x: number; y: number; vx: number; vy: number; a: number; spin: number };
export type Box = { l: number; r: number; t: number; b: number };
export type Game = { t: number; wait: number; items: Item[]; score: number; lives: number };

export const POINTS: Record<Kind, number> = { pop: 1, rose: 5, burnt: 0 };
/** Hit radius: generous for the good ones, tight for the burnt ones, so near misses go the player's way. */
export const HIT: Record<Kind, number> = { pop: 16, rose: 18, burnt: 9 };
const ROSE = 0.08;

/** Seconds between drops: 0.9 at the start, easing towards 0.35. */
export const every = (t: number) => 0.35 + 0.55 * Math.exp(-t / 50);
/** Fall speed in units/s: 140 at the start, easing towards 380. */
export const fall = (t: number) => 380 - 240 * Math.exp(-t / 60);
/** More burnt ones as it goes: 12% → 30%. */
export const burntChance = (t: number) => Math.min(0.3, 0.12 + t / 500);

export const newGame = (): Game => ({ t: 0, wait: 0.5, items: [], score: 0, lives: 3 });

/** A new falling thing at the top, somewhere across the field, with a little drift and spin. */
export function drop(t: number, rnd = Math.random): Item {
	const k = rnd();
	const kind: Kind = k < ROSE ? "rose" : k < ROSE + burntChance(t) ? "burnt" : "pop";
	return { kind, x: 24 + rnd() * (W - 48), y: -24, vx: (rnd() - 0.5) * 36, vy: fall(t) * (0.9 + rnd() * 0.2), a: rnd() * Math.PI * 2, spin: (rnd() - 0.5) * 4 };
}

/** The top part of the head, a little smaller than the drawing: only that catches. */
export function catchBox(x: number, who: Who): Box {
	const { w, h } = HEAD[who];
	const top = FLOOR - h;
	return { l: x - w * 0.4, r: x + w * 0.4, t: top + h * 0.05, b: top + h * 0.5 };
}

/** Does the item (a circle) touch the box? */
export function hits(it: Item, b: Box) {
	const dx = it.x - Math.max(b.l, Math.min(b.r, it.x));
	const dy = it.y - Math.max(b.t, Math.min(b.b, it.y));
	return dx * dx + dy * dy < HIT[it.kind] ** 2;
}

/** Advance `dt` seconds with the head's catch box at `box`. Missed things fall off the bottom and are simply gone. */
export function step(g: Game, dt: number, box: Box, rnd = Math.random): { g: Game; got: Item[] } {
	const t = g.t + dt;
	const items: Item[] = [];
	const got: Item[] = [];
	for (const it of g.items) {
		const x = it.x + it.vx * dt;
		const n = { ...it, x, y: it.y + it.vy * dt, a: it.a + it.spin * dt, vx: x < 16 || x > W - 16 ? -it.vx : it.vx };
		if (hits(n, box)) got.push(n);
		else if (n.y < H + 30) items.push(n);
	}
	let wait = g.wait - dt;
	if (wait <= 0) {
		items.push(drop(t, rnd));
		wait += every(t);
	}
	const score = g.score + got.reduce((s, it) => s + POINTS[it.kind], 0);
	const lives = g.lives - got.filter((it) => it.kind === "burnt").length;
	return { g: { t, wait, items, score, lives }, got };
}
