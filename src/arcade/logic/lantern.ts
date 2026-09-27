/* Sky Lantern on a 360×480 field: gravity, a lift per tap, and pairs of rooftops (below) and marigold garlands (above)
   scrolling past with a gap between. Pure: the view feeds it taps and time. */

export const W = 360;
export const H = 480;
export const GROUND = 452;
/** Where the lantern floats (it stays put, the town scrolls past) and its hit circle: smaller than the drawn lantern, so a graze is forgiven. */
export const LX = 100;
export const R = 13;
export const LIFT = -250;
const GRAVITY = 700; // gentle: a paper lantern, not a brick
const MAX_FALL = 300;
const SPACING = 210; // from one pair to the next
const MAX_SHIFT = 120; // how far a gap may move from the last one, so it can always be reached

export type Pair = { x: number; w: number; top: number; bottom: number; seed: number; passed: boolean };
export type Sky = { y: number; vy: number; pairs: Pair[]; score: number; alive: boolean; died?: "roof" | "garland" | "ground" };
export type Rect = { x: number; y: number; w: number; h: number };

export const gapSize = (score: number) => Math.max(120, 170 - score * 2);
export const speed = (score: number) => Math.min(220, 150 + score * 2.5);

/** Starts with a lift, so the tap that starts the game is the first flap. */
export const newSky = (): Sky => ({ y: 200, vy: LIFT, pairs: [], score: 0, alive: true });
export const flap = (s: Sky): Sky => (s.alive ? { ...s, vy: LIFT } : s);

/** The next gap: gapSize() tall, within MAX_SHIFT of the last one, leaving room for a garland above and a roof below. */
export function nextGap(score: number, prevMid: number, rnd = Math.random) {
	const size = gapSize(score);
	const lo = 60 + size / 2;
	const hi = GROUND - 50 - size / 2;
	const mid = Math.min(hi, Math.max(lo, prevMid + (rnd() * 2 - 1) * MAX_SHIFT));
	return { top: mid - size / 2, bottom: mid + size / 2 };
}

/** What the lantern can hit: the garland is inset a little, its beads are round. */
export const rects = (p: Pair): { garland: Rect; roof: Rect } => ({
	garland: { x: p.x + 3, y: -50, w: p.w - 6, h: p.top + 50 },
	roof: { x: p.x, y: p.bottom, w: p.w, h: GROUND - p.bottom },
});

/** Does a circle touch a rectangle? (the nearest point of the rectangle is within r) */
export function hits(cx: number, cy: number, r: number, b: Rect) {
	const dx = cx - Math.min(b.x + b.w, Math.max(b.x, cx));
	const dy = cy - Math.min(b.y + b.h, Math.max(b.y, cy));
	return dx * dx + dy * dy < r * r;
}

export function step(s: Sky, dt: number, rnd = Math.random): Sky {
	if (!s.alive) return s;
	let vy = Math.min(MAX_FALL, s.vy + GRAVITY * dt);
	let y = s.y + vy * dt;
	if (y < R) [y, vy] = [R, Math.max(0, vy)]; // the top edge just stops it
	const dx = speed(s.score) * dt;
	let score = s.score;
	const pairs: Pair[] = [];
	for (const p of s.pairs) {
		const x = p.x - dx;
		if (x + p.w < 0) continue; // off the left edge
		const passed = x + p.w < LX - R;
		if (passed && !p.passed) score++;
		pairs.push({ ...p, x, passed });
	}
	const last = pairs[pairs.length - 1];
	if (!last || last.x + SPACING < W + 20) {
		const gap = nextGap(score, last ? (last.top + last.bottom) / 2 : 220, rnd);
		pairs.push({ x: last ? last.x + SPACING : W + 60, w: 54 + rnd() * 14, ...gap, seed: rnd(), passed: false });
	}
	if (y + R >= GROUND) return { y: GROUND - R, vy: 0, pairs, score, alive: false, died: "ground" };
	for (const p of pairs) {
		const r = rects(p);
		if (hits(LX, y, R, r.roof)) return { y, vy, pairs, score, alive: false, died: "roof" };
		if (hits(LX, y, R, r.garland)) return { y, vy, pairs, score, alive: false, died: "garland" };
	}
	return { y, vy, pairs, score, alive: true };
}
