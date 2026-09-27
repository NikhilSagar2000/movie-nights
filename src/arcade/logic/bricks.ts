/* Brick Breaker in a 360×480 field. Pure (no DOM): the view sets the paddle's x and calls step() every frame, which
   moves the balls, breaks bricks and drops tuberoses. step() changes the world in place: it runs 60 times a second. */

export const W = 360;
export const H = 480;
export const R = 6.5; // ball radius
export const PAD = { y: 444, w: 68, h: 12 }; // the paddle's top edge, width, height
export const COLS = 7;
export const ROWS = 6;
export const DROP = { w: 16, h: 28 }; // a falling tuberose's catch box
const WALL = { top: 58, side: 14, gap: 5, h: 17 };
const MAX_ANGLE = Math.PI / 3; // off the paddle: up to 60° either side of straight up
const FALL = 120; // tuberose fall speed, units/s
const DROP_CHANCE = 0.12;
const REST = 1; // seconds the ball rests on the paddle before it launches by itself

export type Box = { x: number; y: number; w: number; h: number };
export type Brick = Box & { row: number; alive: boolean };
export type Ball = { x: number; y: number; vx: number; vy: number };
export type Side = "top" | "bottom" | "left" | "right";
export type World = {
	paddle: number; // centre x
	balls: Ball[];
	bricks: Brick[];
	drops: { x: number; y: number }[];
	/** The ball rests on the paddle, waiting for a tap (only that one ball is in the world then). */
	held: boolean;
	wait: number;
	lives: number;
	score: number;
	wall: number;
	over: boolean;
};
export type Ev = { t: "break"; brick: Brick } | { t: "paddle" } | { t: "catch" } | { t: "lost" } | { t: "wall" };

/** Ball speed in units/s: 8% faster on each new wall. */
export const speed = (wall: number) => 290 * 1.08 ** wall;

export function newWall(): Brick[] {
	const w = (W - WALL.side * 2 - WALL.gap * (COLS - 1)) / COLS;
	const bricks: Brick[] = [];
	for (let row = 0; row < ROWS; row++)
		for (let col = 0; col < COLS; col++)
			bricks.push({ x: WALL.side + col * (w + WALL.gap), y: WALL.top + row * (WALL.h + WALL.gap), w, h: WALL.h, row, alive: true });
	return bricks;
}

export function newWorld(): World {
	const w: World = { paddle: W / 2, balls: [], bricks: newWall(), drops: [], held: true, wait: 0, lives: 3, score: 0, wall: 0, over: false };
	rest(w);
	return w;
}

function rest(w: World) {
	w.held = true;
	w.wait = 0;
	w.drops = [];
	w.balls = [{ x: w.paddle, y: PAD.y - R, vx: 0, vy: 0 }];
}

/** Which side of box `b` a circle touches, or null if it doesn't. At a corner it's the side the ball is moving into
 *  (else the side it's further out on); a centre already inside leaves by the nearest side. */
export function hitSide(x: number, y: number, r: number, b: Box, vx = 0, vy = 0): Side | null {
	const dx = x - Math.max(b.x, Math.min(x, b.x + b.w));
	const dy = y - Math.max(b.y, Math.min(y, b.y + b.h));
	if (dx * dx + dy * dy > r * r) return null;
	if (dx === 0 && dy === 0) {
		const out: Record<Side, number> = { left: x - b.x, right: b.x + b.w - x, top: y - b.y, bottom: b.y + b.h - y };
		return (Object.keys(out) as Side[]).reduce((a, s) => (out[s] < out[a] ? s : a));
	}
	const h: Side = dx < 0 ? "left" : "right";
	const v: Side = dy < 0 ? "top" : "bottom";
	if (dx === 0) return v;
	if (dy === 0) return h;
	const intoH = dx < 0 ? vx > 0 : vx < 0;
	const intoV = dy < 0 ? vy > 0 : vy < 0;
	if (intoH !== intoV) return intoH ? h : v;
	return Math.abs(dx) > Math.abs(dy) ? h : v;
}

/** Bounce off `side`: that velocity component points away from the box (never flipped back into it). */
function reflect(b: Ball, side: Side) {
	if (side === "left") b.vx = -Math.abs(b.vx);
	else if (side === "right") b.vx = Math.abs(b.vx);
	else if (side === "top") b.vy = -Math.abs(b.vy);
	else b.vy = Math.abs(b.vy);
}

/** The angle off the paddle, in radians from straight up: −60° at its left end, 0 in the middle, 60° at the right end. */
export function bounceAngle(hitX: number, paddleX: number, w = PAD.w) {
	return Math.max(-1, Math.min(1, (hitX - paddleX) / (w / 2))) * MAX_ANGLE;
}

/** How many slices a move of `dist` is cut into, so no slice is longer than the ball's radius and it can't hop over a brick. */
export const slices = (dist: number, r = R) => Math.max(1, Math.ceil(dist / r));

function aim(b: Ball, angle: number, s: number) {
	b.vx = s * Math.sin(angle);
	b.vy = -s * Math.cos(angle);
}

/** Launch the resting ball, a little to one side so no two launches are the same. */
export function launch(w: World, rnd = Math.random) {
	if (!w.held || w.over) return;
	w.held = false;
	aim(w.balls[0], (rnd() - 0.5) * 0.6, speed(w.wall));
}

/** One frame. Returns what happened, for the view's little effects. */
export function step(w: World, dt: number, rnd = Math.random): Ev[] {
	const ev: Ev[] = [];
	if (w.over) return ev;
	w.paddle = Math.max(PAD.w / 2, Math.min(W - PAD.w / 2, w.paddle));
	if (w.held) {
		Object.assign(w.balls[0], { x: w.paddle, y: PAD.y - R });
		if ((w.wait += dt) >= REST) launch(w, rnd);
		return ev;
	}
	const s = speed(w.wall);
	for (const b of w.balls) {
		const n = slices(Math.hypot(b.vx, b.vy) * dt);
		for (let i = 0; i < n; i++) {
			b.x += (b.vx * dt) / n;
			b.y += (b.vy * dt) / n;
			if (b.x < R) {
				b.x = R;
				b.vx = Math.abs(b.vx);
			} else if (b.x > W - R) {
				b.x = W - R;
				b.vx = -Math.abs(b.vx);
			}
			if (b.y < R) {
				b.y = R;
				b.vy = Math.abs(b.vy);
			}
			// the paddle only catches a falling ball whose centre isn't already below it
			if (b.vy > 0 && b.y + R >= PAD.y && b.y <= PAD.y + PAD.h && Math.abs(b.x - w.paddle) <= PAD.w / 2 + R) {
				aim(b, bounceAngle(b.x, w.paddle), s);
				b.y = PAD.y - R;
				ev.push({ t: "paddle" });
			}
			// at most one brick per slice: two touched at once must not flip the ball twice
			for (const k of w.bricks) {
				const side = k.alive && hitSide(b.x, b.y, R, k, b.vx, b.vy);
				if (!side) continue;
				reflect(b, side);
				k.alive = false;
				w.score++;
				ev.push({ t: "break", brick: k });
				if (rnd() < DROP_CHANCE) w.drops.push({ x: k.x + k.w / 2, y: k.y + k.h / 2 });
				break;
			}
		}
	}
	w.balls = w.balls.filter((b) => b.y - R <= H);

	for (const d of w.drops) d.y += FALL * dt;
	w.drops = w.drops.filter((d) => {
		const caught = Math.abs(d.x - w.paddle) <= (PAD.w + DROP.w) / 2 && d.y + DROP.h / 2 >= PAD.y && d.y - DROP.h / 2 <= PAD.y + PAD.h;
		if (caught) {
			const b = { x: Math.max(R, Math.min(W - R, d.x)), y: PAD.y - R, vx: 0, vy: 0 };
			aim(b, (rnd() - 0.5) * (Math.PI / 3), s);
			w.balls.push(b);
			ev.push({ t: "catch" });
		}
		return !caught && d.y - DROP.h / 2 < H;
	});

	if (w.bricks.every((k) => !k.alive)) {
		w.wall++;
		w.bricks = newWall();
		rest(w);
		ev.push({ t: "wall" });
	} else if (!w.balls.length) {
		ev.push({ t: "lost" });
		if (--w.lives <= 0) w.over = true;
		else rest(w);
	}
	return ev;
}
