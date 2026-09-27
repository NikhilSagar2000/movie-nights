import type { Who } from "../../../shared/types";

/* Rooftop Run: the head runs along a night rooftop, water tanks and dish antennas scroll in, jump them. Pure: the
   view feeds it time, jump presses and whether the jump is still held. Heights are measured up from the roof. */

export const W = 640;
export const H = 360;
/** The roof's surface (canvas y). */
export const GROUND = 296;
/** The head's centre (canvas x). */
export const RUN_X = 120;
/** Her drawn height; his is 0.785 of it (sprite viewBoxes: her 51.4×78.1, him 59.2×61.3, same drawing scale). */
export const HEAD_H = 80;
export const HEAD: Record<Who, { w: number; h: number }> = {
	a: { w: HEAD_H * 0.785 * (59.2 / 61.3), h: HEAD_H * 0.785 },
	b: { w: HEAD_H * (51.4 / 78.1), h: HEAD_H },
};

export const G = 1800; // gravity, units/s²: a floaty jump, so a tap has time to clear things at the slow start
export const G_HOLD = 1220; // while the jump is held and still rising: a higher, floatier jump
export const V0 = 585; // take-off speed
const BUFFER = 0.12; // a press this soon before landing still jumps
/** The longest time in the air (a held jump): up at G_HOLD, down at G. */
export const AIR = V0 / G_HOLD + Math.sqrt((V0 * V0) / G_HOLD / G);

export type Kind = "tank" | "dish";
export type Ob = { kind: Kind; x: number; w: number; h: number };
export type Box = { l: number; r: number; t: number; b: number };
export type Run = { t: number; dist: number; y: number; vy: number; buffer: number; obs: Ob[]; gap: number; crashed?: Kind };

/** Running speed, units/s: 260 at the start, up to 560 after two minutes. */
export const speedAt = (t: number) => Math.min(560, 260 + t * 2.5);
export const metres = (dist: number) => Math.floor(dist / 40);
/** Space after an obstacle: always enough to land from a full jump and take off again. */
export const minGap = (speed: number) => speed * AIR + 70;
export const nextGap = (speed: number, rnd = Math.random) => minGap(speed) * (1 + rnd() * 0.8);

export const newRun = (): Run => ({ t: 0, dist: 0, y: 0, vy: 0, buffer: 0, obs: [], gap: 0 });

/** A black water tank (low, wide) or a dish antenna (tall, narrow), in varied sizes. */
export function obstacle(x: number, rnd = Math.random): Ob {
	return rnd() < 0.62 ? { kind: "tank", x, w: 38 + rnd() * 16, h: 34 + rnd() * 22 } : { kind: "dish", x, w: 30 + rnd() * 10, h: 44 + rnd() * 20 };
}

/** Forgiving hitboxes: a tank is its body; a dish is its bowl and a thin pole. */
export function boxes(o: Ob): Box[] {
	const top = GROUND - o.h;
	if (o.kind === "tank") return [{ l: o.x + 4, r: o.x + o.w - 4, t: top + 5, b: GROUND }];
	const mid = o.x + o.w / 2;
	return [
		{ l: o.x + 3, r: o.x + o.w - 3, t: top + 4, b: top + o.w * 0.5 },
		{ l: mid - 3, r: mid + 3, t: top, b: GROUND },
	];
}

/** The head's hitbox, a good bit smaller than the drawing. `y` = how high it is off the roof. */
export function headBox(y: number, head: { w: number; h: number }): Box {
	return { l: RUN_X - head.w * 0.3, r: RUN_X + head.w * 0.3, t: GROUND - y - head.h * 0.85, b: GROUND - y - 3 };
}

const overlap = (a: Box, b: Box) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;

/** Jump if on the roof; in the air it's remembered for a moment (no double jump). */
export function jump(r: Run): Run {
	return r.y === 0 && r.vy === 0 ? { ...r, vy: V0 } : { ...r, buffer: BUFFER };
}

/** Advance `dt` seconds. `held` = the jump is still held down (releasing early cuts the rise). */
export function step(r: Run, dt: number, held: boolean, head: { w: number; h: number }, rnd = Math.random): Run {
	if (r.crashed) return r;
	const speed = speedAt(r.t);
	let vy = r.vy - (held && r.vy > 0 ? G_HOLD : G) * dt;
	let y = r.y + vy * dt;
	let buffer = Math.max(0, r.buffer - dt);
	if (y <= 0) {
		y = 0;
		vy = buffer > 0 ? V0 : 0;
		buffer = 0;
	}
	const obs = r.obs.map((o) => ({ ...o, x: o.x - speed * dt })).filter((o) => o.x + o.w > -10);
	let gap = r.gap;
	const last = obs[obs.length - 1];
	if (!last || last.x + last.w + gap < W + 40) {
		obs.push(obstacle(last ? last.x + last.w + gap : W + 60, rnd)); // the first one comes after a short run-up
		gap = nextGap(speed, rnd);
	}
	const me = headBox(y, head);
	const hit = obs.find((o) => boxes(o).some((b) => overlap(b, me)));
	return { t: r.t + dt, dist: r.dist + speed * dt, y, vy, buffer, obs, gap, crashed: hit?.kind };
}
