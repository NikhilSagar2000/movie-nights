import { describe, expect, it } from "vitest";
import { catchBox, drop, every, fall, FLOOR, H, HEAD, newGame, step, W, type Item } from "./popcorn";

const item = (kind: Item["kind"], x: number, y: number): Item => ({ kind, x, y, vx: 0, vy: 200, a: 0, spin: 0 });
const box = catchBox(W / 2, "a");
const top = FLOOR - HEAD.a.h;

describe("popcorn", () => {
	it("gets busier and faster, then levels off", () => {
		expect(every(0)).toBeCloseTo(0.9);
		expect(fall(0)).toBeCloseTo(140);
		expect(every(60)).toBeLessThan(every(10));
		expect(fall(60)).toBeGreaterThan(fall(10));
		expect(every(600)).toBeCloseTo(0.35, 2);
		expect(fall(900)).toBeCloseTo(380, 0);
	});
	it("drops popcorn mostly, a rare tuberose, some burnt ones, inside the field", () => {
		expect(drop(0, () => 0.01).kind).toBe("rose");
		expect(drop(0, () => 0.1).kind).toBe("burnt");
		expect(drop(0, () => 0.5).kind).toBe("pop");
		expect(drop(0, () => 0.25).kind).toBe("pop");
		expect(drop(200, () => 0.25).kind).toBe("burnt"); // later on, more of them are burnt
		for (const r of [0, 0.999]) {
			const it = drop(0, () => r);
			expect(it.x).toBeGreaterThan(0);
			expect(it.x).toBeLessThan(W);
		}
	});
	it("catches on the top of the head, not beside it or once it has passed", () => {
		const t = (it: Item) => step({ ...newGame(), wait: 9, items: [it] }, 0.016, box).got.length;
		expect(t(item("pop", W / 2, top))).toBe(1);
		expect(t(item("pop", W / 2 + HEAD.a.w * 0.4 + 10, top + 10))).toBe(1); // the edge of the head still catches
		expect(t(item("pop", W / 2 + HEAD.a.w, top + 10))).toBe(0);
		expect(t(item("pop", W / 2, FLOOR - 4))).toBe(0); // down by the chin: too late
	});
	it("scores popcorn and tuberoses; a burnt one costs a life", () => {
		const g = { ...newGame(), wait: 9, items: [item("pop", W / 2, top), item("rose", W / 2 - 6, top), item("burnt", W / 2 + 6, top)] };
		const r = step(g, 0.016, box);
		expect(r.g.score).toBe(6);
		expect(r.g.lives).toBe(2);
		expect(r.g.items).toHaveLength(0);
	});
	it("a missed one just falls away", () => {
		let g = { ...newGame(), wait: 99, items: [item("pop", 30, FLOOR)] };
		for (let i = 0; i < 30; i++) g = step(g, 0.05, box).g;
		expect(g.items).toHaveLength(0);
		expect(g.lives).toBe(3);
		expect(g.score).toBe(0);
		expect(H).toBeGreaterThan(FLOOR);
	});
	it("spawns on the clock", () => {
		let g = newGame();
		for (let i = 0; i < 60; i++) g = step(g, 0.05, { l: -9, r: -8, t: -9, b: -8 }).g; // 3 s, head out of the way
		expect(g.items.length).toBeGreaterThanOrEqual(3);
		expect(g.items.length).toBeLessThanOrEqual(4);
	});
});
