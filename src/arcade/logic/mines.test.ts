import { describe, expect, it } from "vitest";
import { around, chord, flag, newBoard, open, type Board } from "./mines";

/** A laid board with mines at `at`, counts filled in. */
function laid(n: number, at: number[]): Board {
	const b = newBoard(n, at.length);
	const cells = b.cells.map((c, i) => ({ ...c, mine: at.includes(i) }));
	cells.forEach((c, i) => (c.near = around(n, i).filter((j) => cells[j].mine).length));
	return { ...b, cells, placed: true };
}
/** A small seeded random (mulberry32), so every run tries the same boards. */
function seeded(seed: number) {
	return () => {
		seed = (seed + 0x6d2b79f5) | 0;
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

describe("minesweeper", () => {
	it("the first open is always safe and opens an area", () => {
		for (let seed = 1; seed <= 200; seed++) {
			const rnd = seeded(seed);
			const [n, mines] = ([[9, 10], [12, 22], [16, 40]] as const)[seed % 3];
			const first = Math.floor(rnd() * n * n);
			const b = open(newBoard(n, mines), first, rnd);
			expect(b.state).not.toBe("lost");
			expect(b.cells.filter((c) => c.mine)).toHaveLength(mines);
			expect(b.cells[first].near).toBe(0); // no mine next to it, so it spreads
			for (const j of around(n, first)) expect(b.cells[j].open && !b.cells[j].mine).toBe(true);
		}
	});
	it("flood-opens a region of zeros up to its numbers", () => {
		// mines down column 2 of a 5×5: opening the far right opens columns 3–4 only
		const b = open(laid(5, [2, 7, 12, 17, 22]), 4);
		const opened = b.cells.flatMap((c, i) => (c.open ? [i] : []));
		expect(opened).toEqual([3, 4, 8, 9, 13, 14, 18, 19, 23, 24]);
		expect(b.state).toBe("play");
	});
	it("is won when every safe cell is open, and flags the mines", () => {
		let b = laid(3, [0]);
		b = open(b, 1);
		expect(b.state).toBe("play");
		b = open(b, 8); // the zeros flood the rest
		expect(b.state).toBe("won");
		expect(b.cells[0].flag).toBe(true);
	});
	it("a mine loses, and remembers which one", () => {
		const b = open(laid(3, [4]), 4);
		expect(b.state).toBe("lost");
		expect(b.hit).toBe(4);
	});
	it("flags can't be opened", () => {
		const b = flag(laid(3, [0]), 5);
		expect(open(b, 5)).toBe(b);
		expect(flag(b, 5).cells[5].flag).toBe(false); // and flag again takes it off
	});
	it("chords a number whose flags add up, and a wrong flag loses", () => {
		const b = open(laid(4, [0, 15]), 1); // a 1 next to the top-left mine
		expect(chord(b, 1)).toBe(b); // no flags yet: nothing happens
		const right = chord(flag(b, 0), 1);
		expect([2, 4, 5, 6].every((i) => right.cells[i].open)).toBe(true);
		expect(right.state).toBe("won"); // the zeros it opened flood the rest
		const wrong = chord(flag(b, 4), 1);
		expect(wrong.state).toBe("lost");
		expect(wrong.hit).toBe(0);
	});
});
