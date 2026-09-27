import { describe, expect, it } from "vitest";
import { bestsOf, gameOf, NO_BESTS, recordBest } from "./bests";

describe("bests", () => {
	it("keeps only real solo game keys", () => {
		expect(gameOf("snake")).toBe("snake");
		expect(gameOf("mines:s")).toBe("mines");
		expect(gameOf("chess")).toBeNull();
		expect(gameOf("mines:s:x")).toBeNull();
		expect(gameOf("mines:SMALL")).toBeNull();
		expect(gameOf("mines:x")).toBeNull(); // only the real board sizes
		expect(gameOf("mines")).toBeNull(); // Minesweeper bests are per size
		expect(gameOf("snake:s")).toBeNull(); // no modes here
	});
	it("records only improvements, and rejects junk", () => {
		const b = recordBest(NO_BESTS, "a", "snake", 12)!;
		expect(b.scores.a.snake).toBe(12);
		expect(recordBest(b, "a", "snake", 9)).toBeNull();
		expect(recordBest(b, "a", "snake", 12)).toBeNull();
		expect(recordBest(b, "a", "snake", 13)!.scores.a.snake).toBe(13);
		for (const bad of [NaN, -1, 1e9, "20", 0]) expect(recordBest(b, "a", "snake", bad)).toBeNull();
	});
	it("times: lower is better, and 0 seconds counts", () => {
		const b = recordBest(NO_BESTS, "b", "mines:s", 90)!;
		expect(recordBest(b, "b", "mines:s", 95)).toBeNull();
		expect(recordBest(b, "b", "mines:s", 0)!.scores.b["mines:s"]).toBe(0);
	});
	it("leaves a note only at the moment you pass them", () => {
		let b = recordBest(NO_BESTS, "b", "bloom", 500)!;
		b = recordBest(b, "a", "bloom", 300)!;
		expect(b.notes.b).toHaveLength(0); // still behind
		b = recordBest(b, "a", "bloom", 700)!;
		expect(b.notes.b).toEqual([expect.objectContaining({ key: "bloom", by: "a", score: 700, yours: 500 })]);
		b = { ...b, notes: { a: [], b: [] } }; // seen
		b = recordBest(b, "a", "bloom", 900)!; // already ahead: no new note
		expect(b.notes.b).toHaveLength(0);
	});
	it("doesn't change the value it was given", () => {
		const b = bestsOf(undefined);
		recordBest(b, "a", "snake", 5);
		expect(b.scores.a).toEqual({});
	});
});
