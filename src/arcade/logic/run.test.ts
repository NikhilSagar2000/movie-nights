import { describe, expect, it } from "vitest";
import { AIR, GROUND, HEAD, jump, metres, minGap, newRun, nextGap, RUN_X, speedAt, step, type Ob, type Run } from "./run";

const DT = 1 / 60;
const me = HEAD.a;
const lcg = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
/** A run with the obstacles pinned (no new ones spawn within the test's reach). */
const at = (obs: Ob[] = []): Run => ({ ...newRun(), obs, gap: 5000 });

/** Jump now, hold for `hold` seconds, and report the peak height and time in the air. */
function flight(hold: number) {
	let r = jump(at());
	let peak = 0;
	let t = 0;
	do {
		r = step(r, DT, t < hold, me);
		peak = Math.max(peak, r.y);
		t += DT;
	} while (r.y > 0);
	return { peak, t };
}

/** Would a held jump taken `wait` frames from now clear the next obstacle? "late" = hit it on the way up, "early" = came down on or before it. */
function tryJump(r: Run, wait: number): "ok" | "early" | "late" {
	const target = r.obs.find((o) => o.x + o.w > RUN_X - me.w * 0.3);
	if (!target) return "early";
	let s = r;
	for (let i = 0; i < wait; i++) s = step(s, DT, false, me, () => 0.5);
	s = jump(s);
	for (;;) {
		s = step(s, DT, true, me, () => 0.5);
		if (s.crashed) return s.vy > 0 ? "late" : "early";
		const passed = target.x + target.w - (s.dist - r.dist) < RUN_X - me.w * 0.3;
		if (s.y === 0) return passed ? "ok" : "early";
	}
}

describe("rooftop run", () => {
	it("a tap is a short hop; holding goes higher; letting go halfway lands in between", () => {
		const tap = flight(0);
		const full = flight(1);
		const half = flight(0.15);
		expect(tap.peak).toBeGreaterThan(80);
		expect(tap.peak).toBeLessThan(100);
		expect(full.peak).toBeGreaterThan(125);
		expect(full.peak).toBeLessThan(145);
		expect(half.peak).toBeGreaterThan(tap.peak);
		expect(half.peak).toBeLessThan(full.peak);
		expect(full.t).toBeCloseTo(AIR, 1);
	});
	it("no double jump, but a press just before landing jumps again", () => {
		let r = step(jump(at()), DT, false, me);
		const vy = r.vy;
		r = jump(r);
		expect(r.vy).toBe(vy); // mid-air: nothing
		while (r.y > 0 && !(r.vy < 0 && r.y < 8)) r = step(r, DT, false, me);
		r = step(jump(r), DT, false, me); // pressed a frame or two early
		r = step(step(r, DT, false, me), DT, false, me);
		expect(r.y).toBeGreaterThan(0);
		expect(r.vy).toBeGreaterThan(0);
	});
	it("runs into a tank on the roof, clears it in the air, and forgives a clipped corner", () => {
		const tank: Ob = { kind: "tank", x: RUN_X, w: 50, h: 50 };
		expect(step(at([tank]), DT, false, me).crashed).toBe("tank");
		expect(step({ ...at([tank]), y: 60 }, DT, false, me).crashed).toBeUndefined();
		// the head's front edge just touching the tank's drawn edge: no crash
		const edge: Ob = { ...tank, x: RUN_X + me.w * 0.3 + 1 };
		expect(step(at([edge]), 0.001, false, me).crashed).toBeUndefined();
		const dish: Ob = { kind: "dish", x: RUN_X - 20, w: 40, h: 70 };
		expect(step(at([dish]), DT, false, me).crashed).toBe("dish");
	});
	it("leaves room after every obstacle to land from a full jump and go again", () => {
		for (const s of [260, 400, 560]) {
			expect(nextGap(s, () => 0)).toBe(minGap(s));
			expect(minGap(s)).toBeGreaterThan(s * AIR + 60);
			expect(nextGap(s, () => 0.999)).toBeGreaterThan(minGap(s));
		}
		expect(speedAt(0)).toBe(260);
		expect(speedAt(999)).toBe(560);
		expect(metres(79)).toBe(1);
	});
	it("a player who jumps at the last moment clears two and a half minutes of rooftops", () => {
		for (const seed of [1, 7, 42]) {
			const rnd = lcg(seed);
			let r = newRun();
			let jumps = 0;
			while (r.t < 150) {
				if (r.y === 0 && r.vy === 0 && tryJump(r, 1) === "late") {
					expect(tryJump(r, 0)).toBe("ok");
					r = jump(r);
					jumps++;
				}
				r = step(r, DT, true, me, rnd);
				if (r.crashed) throw new Error(`seed ${seed}: crashed at ${r.t.toFixed(1)} s`);
			}
			expect(jumps).toBeGreaterThan(80);
			expect(metres(r.dist)).toBeGreaterThan(1500);
		}
	});
	it("her taller head clears the same things", () => {
		const tank: Ob = { kind: "tank", x: RUN_X - 20, w: 50, h: 60 };
		expect(step({ ...at([tank]), y: 62 }, DT, false, HEAD.b).crashed).toBeUndefined();
		expect(GROUND).toBeGreaterThan(60 + HEAD.b.h);
	});
});
