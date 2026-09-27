import { describe, expect, it } from "vitest";
import { normalize } from "../../gameLogic";
import { CARDS } from "./cards";
import { MOVIES } from "./movies";
import { PEOPLE } from "./people";
import { SONGS } from "./songs";
import { WAVES } from "./waves";

const key = (s: string) => normalize(s).replace(/ /g, "");
/** Every name and alias across a deck must be unique, or a guess could match two cards. */
const clashes = (names: string[][]) => {
	const seen = new Map<string, number>();
	const bad: string[] = [];
	names.forEach((ns, i) => new Set(ns.map(key)).forEach((k) => (seen.has(k) && seen.get(k) !== i ? bad.push(k) : seen.set(k, i))));
	return bad;
};
const globalShare = (xs: { g?: 1 }[]) => xs.filter((x) => x.g).length / xs.length;

describe("decks", () => {
	it("are 90% Indian, 10% famous everywhere", () => {
		for (const deck of [PEOPLE, MOVIES, SONGS, CARDS]) {
			expect(globalShare(deck)).toBeGreaterThanOrEqual(0.08);
			expect(globalShare(deck)).toBeLessThanOrEqual(0.12);
		}
	});
	it("have no duplicate names or aliases", () => {
		expect(clashes(PEOPLE.map((p) => [p.n, ...(p.aka ?? [])]))).toEqual([]);
		expect(clashes(MOVIES.map((m) => [m.t, ...(m.aka ?? [])]))).toEqual([]);
		expect(clashes(SONGS.map((s) => [s.t, ...(s.aka ?? [])]))).toEqual([]);
		expect(clashes(CARDS.map((c) => [c.w]))).toEqual([]);
		expect(new Set(WAVES.map((w) => w.join("|").toLowerCase())).size).toBe(WAVES.length);
	});
	it("are big enough to play for a long while", () => {
		expect(PEOPLE.length).toBeGreaterThanOrEqual(250);
		expect(MOVIES.length).toBeGreaterThanOrEqual(200);
		expect(SONGS.length).toBeGreaterThanOrEqual(120);
		expect(CARDS.length).toBeGreaterThanOrEqual(180);
		expect(WAVES.length).toBeGreaterThanOrEqual(80);
	});
	it("Don't Say It cards have four banned words that don't give the word away", () => {
		for (const c of CARDS) {
			expect(c.ban, c.w).toHaveLength(4);
			expect(new Set(c.ban.map(key)).size, c.w).toBe(4);
			for (const b of c.ban) expect(key(b).includes(key(c.w)), `${c.w}: ${b}`).toBe(false);
		}
	});
});
