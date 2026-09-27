import { describe, expect, it } from "vitest";
import { scramble, WORDS } from "./jumble";

const sorted = (s: string) => [...s].sort().join("");
/** A tiny seeded random, so every run tries the same shuffles. */
const seeded = (n: number) => () => ((n = (n * 16807) % 2147483647) - 1) / 2147483646;

describe("jumble", () => {
	it("builds single-word, letters-only, 4–9 letter words from the decks, each once", () => {
		expect(WORDS.length).toBeGreaterThan(150);
		expect(WORDS.every((x) => /^[A-Za-z]{4,9}$/.test(x.w) && x.hint)).toBe(true);
		const keys = WORDS.map((x) => x.w.toLowerCase());
		expect(new Set(keys).size).toBe(keys.length);
		expect(WORDS.find((x) => x.w === "Diwali")?.hint).toBe("Lights");
		expect(WORDS.find((x) => x.w === "Sholay")?.hint).toBe("Gabbar"); // in cards and movies: the card's hint wins
		expect(WORDS.find((x) => x.w === "Kajol")?.hint).toBe("Actress");
		expect(WORDS.some((x) => x.hint === "Movie")).toBe(true);
	});
	it("never returns the word, and keeps exactly its letters", () => {
		const rnd = seeded(7);
		for (const w of ["DIWALI", "BOBBY", "AABB", "ABAB", "LADOO", "MOMOS", "SAMOSA", "PAAN", ...WORDS.map((x) => x.w.toUpperCase())])
			for (let i = 0; i < 40; i++) {
				const s = scramble(w, rnd);
				expect(s).not.toBe(w);
				expect(sorted(s)).toBe(sorted(w));
			}
	});
	it("still differs when the shuffle lands back on the word", () => {
		expect(scramble("ABCD", () => 0.999)).not.toBe("ABCD"); // this rnd shuffles to the identity
		expect(scramble("ABCD", () => 0.999)).toBe("BCDA");
	});
});
