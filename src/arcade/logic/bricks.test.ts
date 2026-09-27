import { describe, expect, it } from "vitest";
import { bounceAngle, hitSide, newWorld, PAD, R, slices, speed, step, type Brick, type World } from "./bricks";

const box = { x: 100, y: 100, w: 40, h: 16 };
const brick = (x: number, y: number, w = 40, h = 16): Brick => ({ x, y, w, h, row: 0, alive: true });
/** A world with the ball already flying from (x, y) at (vx, vy), and only these bricks (plus a far one, so the wall isn't cleared). */
const flying = (x: number, y: number, vx: number, vy: number, bricks: Brick[]): World => ({
	...newWorld(),
	held: false,
	balls: [{ x, y, vx, vy }],
	bricks: [...bricks, brick(0, 0, 4, 4)],
});
const never = () => 1; // rnd that never drops a tuberose

describe("bricks", () => {
	it("finds the side a circle touches a box", () => {
		expect(hitSide(95, 108, 6, box)).toBe("left");
		expect(hitSide(145, 108, 6, box)).toBe("right");
		expect(hitSide(120, 95, 6, box)).toBe("top");
		expect(hitSide(120, 121, 6, box)).toBe("bottom");
		expect(hitSide(120, 124, 6, box)).toBe(null);
		expect(hitSide(95, 95, 6, box)).toBe(null); // near the corner (7.1 away), not touching
		expect(hitSide(120, 102, 6, box)).toBe("top"); // centre inside: out the nearest side
	});
	it("at a corner, picks the side the ball is moving into", () => {
		// just past the bottom-left corner, further out sideways than down
		expect(hitSide(96, 118, 6, box, 0, -300)).toBe("bottom"); // going straight up: the bottom
		expect(hitSide(96, 118, 6, box, 300, 0)).toBe("left"); // going right: the left side
	});
	it("bounces off the paddle at −60°…60° by where it lands", () => {
		expect(bounceAngle(200, 200)).toBe(0);
		expect(bounceAngle(200 - PAD.w / 2, 200)).toBeCloseTo(-Math.PI / 3);
		expect(bounceAngle(200 + PAD.w / 4, 200)).toBeCloseTo(Math.PI / 6);
		expect(bounceAngle(400, 200)).toBeCloseTo(Math.PI / 3); // past the end: no steeper
	});
	it("paddle bounce keeps the speed and heads up to the side it hit", () => {
		const w = flying(200 + PAD.w / 2, PAD.y - R - 1, 0, 300, []);
		w.paddle = 200;
		const ev = step(w, 0.01, never);
		const b = w.balls[0];
		expect(ev.some((e) => e.t === "paddle")).toBe(true);
		expect(b.vy).toBeLessThan(0);
		expect(b.vx).toBeGreaterThan(0);
		expect(Math.hypot(b.vx, b.vy)).toBeCloseTo(speed(0));
	});
	it("slices a big move so no slice is longer than the radius", () => {
		expect(slices(3, 6.5)).toBe(1);
		expect(slices(20, 6.5)).toBe(4);
		expect(20 / slices(20, 6.5)).toBeLessThanOrEqual(6.5);
	});
	it("doesn't tunnel: a very fast ball still breaks a thin brick and bounces", () => {
		// 3000 units/s over a 50 ms frame = 150 units, far more than the 4-unit brick
		const w = flying(180, 300, 0, -3000, [brick(160, 200, 40, 4)]);
		step(w, 0.05, never);
		expect(w.bricks[0].alive).toBe(false);
		expect(w.score).toBe(1);
		expect(w.balls[0].vy).toBeGreaterThan(0);
	});
	it("breaks one brick per slice, and flips the ball once", () => {
		// straight up into the seam between two touching bricks
		const w = flying(140, 123, 0, -300, [brick(100, 100), brick(140, 100)]);
		step(w, 0.005, never);
		expect(w.bricks.filter((k) => !k.alive)).toHaveLength(1);
		expect(w.balls[0].vy).toBeGreaterThan(0);
	});
	it("a caught tuberose adds a ball", () => {
		const w = flying(180, 250, 0, -100, []);
		w.paddle = 100;
		w.drops = [{ x: 100, y: PAD.y - 16 }];
		const ev = step(w, 0.05, never);
		expect(ev.some((e) => e.t === "catch")).toBe(true);
		expect(w.balls).toHaveLength(2);
		expect(w.drops).toHaveLength(0);
	});
	it("losing the last ball costs a life; the third ends it", () => {
		const w = flying(50, 490, 0, 300, []);
		step(w, 0.01, never);
		expect(w.lives).toBe(2);
		expect(w.held).toBe(true);
		w.lives = 1;
		w.held = false;
		w.balls = [{ x: 50, y: 490, vx: 0, vy: 300 }];
		step(w, 0.01, never);
		expect(w.over).toBe(true);
	});
	it("clearing the wall brings the next one, 8% faster", () => {
		const w = { ...flying(180, 300, 0, -3000, []), bricks: [brick(160, 200, 40, 4)] };
		const ev = step(w, 0.05, never);
		expect(ev.some((e) => e.t === "wall")).toBe(true);
		expect(w.wall).toBe(1);
		expect(w.bricks.filter((k) => k.alive)).toHaveLength(42);
		expect(w.held).toBe(true);
		expect(speed(1) / speed(0)).toBeCloseTo(1.08);
	});
});
