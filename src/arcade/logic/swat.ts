/* Mosquito Swat: a 3×3 wall of windows where mosquitoes (and now and then a tuberose) pop up for a moment. Pure: the
   view feeds it frame times and swats, and shows the effects that come back. Spots are 0–8, left to right, top down. */

export type Kind = "bug" | "rose";
export type Pest = { id: number; spot: number; kind: Kind; until: number };
export type Swat = { t: number; score: number; lives: number; pests: Pest[]; nextAt: number; freeAt: number[]; ids: number };
export type Fx = { spot: number; kind: "zap" | "bite" | "oops" | "miss" };

export const LIVES = 3;
const REST = 0.6; // s a spot stays empty after something leaves it, so nothing pops twice in a row too fast
const ROSE = 0.15;
const hard = (score: number) => Math.min(1, score / 36); // 0 → 1 over the first 36 swats
/** How long a pest stays: 1.3 s at first, 0.55 s once you're good. */
export const stay = (score: number) => 1.3 - 0.75 * hard(score);
/** How many can be up at once. */
export const most = (score: number) => (score < 8 ? 1 : score < 20 ? 2 : 3);
const gap = (score: number, rnd: () => number) => (0.3 + rnd() * 0.5) * (1 - 0.5 * hard(score));

export const newSwat = (): Swat => ({ t: 0, score: 0, lives: LIVES, pests: [], nextAt: 0.6, freeAt: Array(9).fill(0), ids: 0 });

/** Time passes: pests that stayed too long leave (a mosquito bites on its way out), and a new one may pop up.
 *  `pests` keeps its identity when nothing came or went, so the view only redraws on a change. */
export function step(s: Swat, dt: number, rnd = Math.random): { s: Swat; fx: Fx[] } {
	if (s.lives <= 0) return { s, fx: [] };
	const t = s.t + dt;
	const fx: Fx[] = [];
	let { pests, lives, nextAt, freeAt, ids } = s;
	if (pests.some((p) => p.until <= t)) {
		freeAt = freeAt.slice();
		for (const p of pests.filter((p) => p.until <= t)) {
			freeAt[p.spot] = t + REST;
			if (p.kind === "bug") {
				lives--;
				fx.push({ spot: p.spot, kind: "bite" });
			}
		}
		pests = pests.filter((p) => p.until > t);
	}
	if (t >= nextAt && lives > 0 && pests.length < most(s.score)) {
		const free = freeAt.flatMap((at, i) => (at <= t && !pests.some((p) => p.spot === i) ? [i] : []));
		if (free.length) {
			const spot = free[Math.floor(rnd() * free.length)];
			pests = [...pests, { id: ++ids, spot, kind: rnd() < ROSE ? "rose" : "bug", until: t + stay(s.score) }];
			nextAt = t + gap(s.score, rnd);
		}
	}
	return { s: { ...s, t, pests, lives, nextAt, freeAt, ids }, fx };
}

/** A swat at a spot: a mosquito scores, a tuberose costs a life, an empty spot is just a miss. */
export function hit(s: Swat, spot: number): { s: Swat; fx: Fx[] } {
	const p = s.pests.find((p) => p.spot === spot);
	if (!p || s.lives <= 0) return { s, fx: [{ spot, kind: "miss" }] };
	const freeAt = s.freeAt.slice();
	freeAt[spot] = s.t + REST;
	const next = { ...s, pests: s.pests.filter((q) => q !== p), freeAt, nextAt: Math.max(s.nextAt, s.t + 0.25) };
	return p.kind === "bug" ? { s: { ...next, score: s.score + 1 }, fx: [{ spot, kind: "zap" }] } : { s: { ...next, lives: s.lives - 1 }, fx: [{ spot, kind: "oops" }] };
}
