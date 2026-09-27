import { describe, expect, it } from "vitest";
import { hit, LIVES, most, newSwat, stay, step, type Pest, type Swat } from "./swat";

/** Runs `secs` of frames at 60 fps. */
function run(s: Swat, secs: number, rnd = Math.random) {
	for (let t = 0; t < secs; t += 1 / 60) s = step(s, 1 / 60, rnd).s;
	return s;
}
const bug = (spot: number, until = 1): Pest => ({ id: 1, spot, kind: "bug", until });

describe("mosquito swat", () => {
	it("pops one up within the first second, never more than allowed", () => {
		let s = newSwat();
		s = run(s, 1);
		expect(s.pests).toHaveLength(1);
		for (let i = 0; i < 600; i++) {
			s = step(s, 1 / 60).s;
			expect(s.pests.length).toBeLessThanOrEqual(most(s.score));
		}
	});
	it("gets faster and busier with the score", () => {
		expect(stay(0)).toBeCloseTo(1.3);
		expect(stay(100)).toBeCloseTo(0.55);
		expect([most(0), most(10), most(30)]).toEqual([1, 2, 3]);
	});
	it("a swatted mosquito scores, a tuberose costs a life, an empty spot is a miss", () => {
		const s: Swat = { ...newSwat(), pests: [bug(4), { id: 2, spot: 0, kind: "rose", until: 1 }] };
		const a = hit(s, 4);
		expect(a.s.score).toBe(1);
		expect(a.fx).toEqual([{ spot: 4, kind: "zap" }]);
		const b = hit(a.s, 0);
		expect(b.s.lives).toBe(LIVES - 1);
		expect(b.fx[0].kind).toBe("oops");
		const c = hit(b.s, 8);
		expect(c.s).toBe(b.s);
		expect(c.fx[0].kind).toBe("miss");
	});
	it("a mosquito that gets away bites; a tuberose leaves quietly", () => {
		const s: Swat = { ...newSwat(), nextAt: 99, pests: [bug(4, 0.5), { id: 2, spot: 0, kind: "rose", until: 0.5 }] };
		const r = step(s, 0.6);
		expect(r.s.pests).toEqual([]);
		expect(r.s.lives).toBe(LIVES - 1);
		expect(r.fx).toEqual([{ spot: 4, kind: "bite" }]);
	});
	it("a spot rests before it pops again", () => {
		// only spot 4 is free: after its mosquito is swatted, nothing comes back for a moment
		const s: Swat = { ...newSwat(), nextAt: 0, freeAt: [9, 9, 9, 9, 0, 9, 9, 9, 9], pests: [bug(4)] };
		let r = hit(s, 4).s;
		r = step(r, 0.4).s;
		expect(r.pests).toEqual([]);
		r = step(r, 0.3).s;
		expect(r.pests.map((p) => p.spot)).toEqual([4]);
	});
	it("is over at no lives, and stops there", () => {
		const s: Swat = { ...newSwat(), lives: 1, nextAt: 99, pests: [bug(2, 0.1)] };
		const r = step(s, 0.2).s;
		expect(r.lives).toBe(0);
		expect(step(r, 5).s).toBe(r);
	});
});
