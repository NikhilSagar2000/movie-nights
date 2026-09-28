import { describe, expect, it } from "vitest";
import type { Stem } from "../shared/gift";
import { BOX_SIZES } from "../shared/gift";
import { boxLayout, bouquetLayout, HEART, heartCells, inside, seeded } from "./giftLayout";

const stems: Stem[] = [
	{ f: "rose", c: "#d64550" },
	{ f: "lavender", c: "#9b86c9" },
	{ f: "sunflower", c: "#f5c23a" },
	{ f: "daisy", c: "#fffcf5" },
	{ f: "gypsophila", c: "#fffcf5" },
];

describe("seeded", () => {
	it("gives the same numbers for the same seed", () => {
		const a = seeded(7),
			b = seeded(7),
			c = seeded(8);
		const xs = [a(), a(), a()];
		expect([b(), b(), b()]).toEqual(xs);
		expect(c()).not.toEqual(xs[0]);
		expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
	});
});

describe("bouquetLayout", () => {
	it("is the same on both screens for the same seed, and changes with a new one", () => {
		expect(bouquetLayout(stems, 42)).toEqual(bouquetLayout(stems, 42));
		expect(bouquetLayout(stems, 43)).not.toEqual(bouquetLayout(stems, 42));
	});
	it("places every stem once, above the ribbon, back to front", () => {
		for (const n of [1, 5, 15]) {
			const many = Array.from({ length: n }, (_, k) => stems[k % stems.length]);
			const heads = bouquetLayout(many, 9);
			expect(heads.map((h) => h.i).sort((a, b) => a - b)).toEqual([...many.keys()]);
			expect(heads.every((h) => h.y < 140 && h.x > 20 && h.x < 180)).toBe(true);
			expect(heads.map((h) => h.y)).toEqual([...heads.map((h) => h.y)].sort((a, b) => a - b));
		}
	});
	it("puts the big blooms nearer the middle than the sprays", () => {
		const heads = bouquetLayout(stems, 3);
		const dist = (f: string) => {
			const h = heads.find((h) => stems[h.i].f === f)!;
			return Math.hypot(h.x - 100, h.y - 84);
		};
		expect(dist("sunflower")).toBeLessThan(dist("gypsophila"));
	});
});

describe("chocolate boxes", () => {
	it("has exactly one cell per chocolate, for every size and shape", () => {
		for (const size of BOX_SIZES) for (const box of ["square", "heart"] as const) expect(boxLayout(size, box).cells).toHaveLength(size);
	});
	it("keeps heart cells inside the heart and apart from each other", () => {
		for (const n of BOX_SIZES) {
			const cells = heartCells(n);
			expect(cells).toHaveLength(n);
			for (const [x, y] of cells) expect(inside([x, y], HEART)).toBe(true);
			for (const a of cells) for (const b of cells) if (a !== b) expect(Math.hypot(a[0] - b[0], (a[1] - b[1]) * (30 / 34))).toBeGreaterThanOrEqual(a[2] * 2 - 1e-6);
		}
	});
});
