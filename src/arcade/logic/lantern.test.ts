import { describe, expect, it } from "vitest";
import { flap, GROUND, gapSize, hits, LX, newSky, nextGap, R, step, type Pair, type Sky } from "./lantern";

const sky = (y: number, pairs: Pair[] = [], vy = 0): Sky => ({ y, vy, pairs, score: 0, alive: true });
const pair = (x: number, top: number, bottom: number): Pair => ({ x, w: 60, top, bottom, seed: 0.5, passed: false });
const run = (s: Sky, secs: number, lift?: number) => {
	for (let t = 0; t < secs; t += 1 / 60) s = step(lift && Math.round(t * 60) % lift === 0 ? flap(s) : s, 1 / 60, () => 0.5);
	return s;
};

describe("sky lantern", () => {
	it("sinks without taps and lands on the ground", () => {
		const s = run(newSky(), 3);
		expect(s.alive).toBe(false);
		expect(s.died).toBe("ground");
		expect(s.y).toBe(GROUND - R);
	});
	it("a flap lifts it", () => {
		const s = step(flap(sky(300)), 0.1);
		expect(s.y).toBeLessThan(300);
		expect(s.alive).toBe(true);
	});
	it("steady flapping keeps it up, and the top edge only stops it", () => {
		const s = run(sky(200), 2, 8);
		expect(s.alive).toBe(true);
		expect(s.y).toBeLessThan(R + 1); // pressed against the top, not gone through it
	});
	it("gaps stay in bounds, move a reachable amount and narrow to 120", () => {
		for (const score of [0, 10, 100])
			for (const prev of [0, 220, 500])
				for (const r of [0, 0.5, 0.999]) {
					const g = nextGap(score, prev, () => r);
					expect(g.bottom - g.top).toBe(gapSize(score));
					expect(g.top).toBeGreaterThanOrEqual(60);
					expect(g.bottom).toBeLessThanOrEqual(GROUND - 50);
				}
		expect(Math.abs((nextGap(0, 220, () => 0.999).top + 85) - 220)).toBeLessThanOrEqual(120);
		expect(gapSize(0)).toBe(170);
		expect(gapSize(1000)).toBe(120);
	});
	it("circle vs rectangle", () => {
		const b = { x: 100, y: 100, w: 50, h: 50 };
		expect(hits(125, 125, 5, b)).toBe(true); // inside
		expect(hits(95, 125, 6, b)).toBe(true); // touching the left side
		expect(hits(90, 125, 6, b)).toBe(false);
		expect(hits(96, 96, 5, b)).toBe(false); // diagonally off the corner: 5.66 away
		expect(hits(97, 97, 5, b)).toBe(true);
	});
	it("passing a pair scores; flying into a roof or a garland ends it", () => {
		const through = step(sky(200, [pair(LX - R - 60 + 1, 130, 300)]), 0.05);
		expect(through.score).toBe(1);
		expect(through.alive).toBe(true);
		expect(step(sky(320, [pair(LX - 10, 150, 310)]), 0.01).died).toBe("roof");
		expect(step(sky(140, [pair(LX - 10, 150, 310)]), 0.01).died).toBe("garland");
	});
});
