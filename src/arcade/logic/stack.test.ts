import { describe, expect, it } from "vitest";
import { cut, HI, LO, slide } from "./stack";

const prev = { x: 100, w: 120 };

describe("ladoo stack", () => {
	it("cuts the overhang on the right", () => {
		expect(cut(prev, { x: 130, w: 120 })).toEqual({ x: 130, w: 90, perfect: false, miss: false, chip: { x: 220, w: 30 } });
	});
	it("cuts the overhang on the left", () => {
		expect(cut(prev, { x: 60, w: 120 })).toEqual({ x: 100, w: 80, perfect: false, miss: false, chip: { x: 60, w: 40 } });
	});
	it("a near-perfect drop snaps on whole", () => {
		expect(cut(prev, { x: 104, w: 120 })).toEqual({ x: 100, w: 120, perfect: true, miss: false, chip: null });
		expect(cut(prev, { x: 95, w: 120 }).perfect).toBe(true);
		expect(cut(prev, { x: 94, w: 120 }).perfect).toBe(false);
	});
	it("no overlap is a miss, and the whole box falls", () => {
		const m = cut(prev, { x: 220, w: 120 }); // just touching the edge
		expect(m.miss).toBe(true);
		expect(m.chip).toEqual({ x: 220, w: 120 });
		expect(cut(prev, { x: -30, w: 120 }).miss).toBe(true);
	});
	it("slides and bounces between the edges", () => {
		expect(slide(100, 1, 60, 10)).toEqual({ x: 110, dir: 1 });
		expect(slide(HI - 30 - 5, 1, 60, 10)).toEqual({ x: HI - 30 - 5, dir: -1 });
		expect(slide(LO - 30 + 2, -1, 60, 6)).toEqual({ x: LO - 30 + 4, dir: 1 });
	});
});
