import type { Dir } from "../kit";

/* Snake on an n×n grid. Pure: the view feeds it turns and ticks. */

export type Pt = [number, number];
export type Snake = { body: Pt[]; dir: Dir; queue: Dir[]; food: Pt; alive: boolean; eaten: number; died?: "wall" | "tail" };

const STEP: Record<Dir, Pt> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const OPPOSITE: Record<Dir, Dir> = { up: "down", down: "up", left: "right", right: "left" };
const same = (a: Pt, b: Pt) => a[0] === b[0] && a[1] === b[1];

/** A random empty cell, or null when the snake fills the board. */
export function freeCell(body: Pt[], n: number, rnd = Math.random): Pt | null {
	const free: Pt[] = [];
	for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (!body.some((p) => p[0] === x && p[1] === y)) free.push([x, y]);
	return free.length ? free[Math.floor(rnd() * free.length)] : null;
}

export function newSnake(n: number, rnd = Math.random): Snake {
	const y = Math.floor(n / 2);
	const body: Pt[] = [
		[4, y],
		[3, y],
		[2, y],
	];
	return { body, dir: "right", queue: [], food: freeCell(body, n, rnd)!, alive: true, eaten: 0 };
}

/** Queue a turn (at most 2 ahead, so quick double turns aren't lost). A reverse or a repeat of the last turn is ignored. */
export function turn(s: Snake, d: Dir): Snake {
	const last = s.queue[s.queue.length - 1] ?? s.dir;
	if (d === last || d === OPPOSITE[last] || s.queue.length >= 2) return s;
	return { ...s, queue: [...s.queue, d] };
}

/** One move. Eating grows the snake by one; a wall or its own body ends it. */
export function step(s: Snake, n: number, rnd = Math.random): Snake {
	if (!s.alive) return s;
	const [dir, ...queue] = s.queue.length ? s.queue : [s.dir];
	const head: Pt = [s.body[0][0] + STEP[dir][0], s.body[0][1] + STEP[dir][1]];
	const eats = same(head, s.food);
	const body = eats ? s.body : s.body.slice(0, -1); // the tail moves out of the way first, unless it grows
	const wall = head[0] < 0 || head[1] < 0 || head[0] >= n || head[1] >= n;
	if (wall || body.some((p) => same(p, head))) return { ...s, dir, queue, alive: false, died: wall ? "wall" : "tail" };
	const next = [head, ...body];
	const food = eats ? freeCell(next, n, rnd) : s.food;
	return { body: next, dir, queue, food: food ?? s.food, alive: food !== null, eaten: s.eaten + (eats ? 1 : 0) };
}
