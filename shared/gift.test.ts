import { describe, expect, it } from "vitest";
import { chocolatesLeft, cleanGift, eat, MAX_STEMS, type Gift } from "./gift";

const choc = { shape: "heart", flavor: "ruby", top: "gold" } as const;
const bouquet = { stems: [{ f: "rose", c: "#D64550" }, { f: "tuberose", c: "#fffcf5" }], wrap: "tissue", wrapColor: "#f7c8d3", ribbon: "#b46a72", seed: 42 };
const chocolates = { size: 4, box: "heart", boxColor: "#b46a72", ribbon: "#f7c8d3", pieces: [choc, choc, null, choc] };

describe("cleanGift", () => {
	it("keeps a real gift, colours lowercased", () => {
		expect(cleanGift({ bouquet, chocolates })).toEqual({ bouquet: { ...bouquet, stems: [{ f: "rose", c: "#d64550" }, bouquet.stems[1]] }, chocolates });
	});
	it("drops unknown flowers, colours a flower doesn't come in, and stems past the limit", () => {
		const stems = [{ f: "cactus", c: "#d64550" }, { f: "sunflower", c: "#d64550" }, { f: "rose", c: "url(x)" }, ...Array.from({ length: 20 }, () => ({ f: "daisy", c: "#fffcf5" }))];
		const g = cleanGift({ bouquet: { ...bouquet, stems } });
		expect(g?.bouquet?.stems.length).toBe(MAX_STEMS - 3);
		expect(g?.bouquet?.stems.every((s) => s.f === "daisy")).toBe(true);
	});
	it("fits the pieces to the box, and a bad piece becomes an empty cell", () => {
		const g = cleanGift({ chocolates: { ...chocolates, size: 6, pieces: [choc, { ...choc, flavor: "mint" }, choc, choc, choc, choc, choc, choc] } });
		expect(g?.chocolates?.pieces).toEqual([choc, null, choc, choc, choc, choc]);
	});
	it("never lets the sender pre-eat, and drops extra keys", () => {
		const g = cleanGift({ chocolates: { ...chocolates, eaten: [0, 1], x: 1 }, extra: true });
		expect(g).toEqual({ chocolates });
	});
	it("keeps the good part when the other is broken", () => {
		expect(cleanGift({ bouquet, chocolates: { ...chocolates, size: 5 } })).toEqual({ bouquet: { ...bouquet, stems: [{ f: "rose", c: "#d64550" }, bouquet.stems[1]] } });
		expect(cleanGift({ bouquet: { ...bouquet, wrap: "gold" }, chocolates })).toEqual({ chocolates });
	});
	it("refuses nothing-at-all: junk, empty bouquets, empty boxes", () => {
		for (const v of [null, "gift", 3, [], {}, { bouquet: { ...bouquet, stems: [] } }, { chocolates: { ...chocolates, pieces: [null, null, null, null] } }]) expect(cleanGift(v)).toBeUndefined();
	});
	it("keeps the seed a whole number", () => {
		expect(cleanGift({ bouquet: { ...bouquet, seed: -7.9 } })?.bouquet?.seed).toBe(7);
		expect(cleanGift({ bouquet: { ...bouquet, seed: "x" } })?.bouquet?.seed).toBe(1);
	});
});

describe("eating", () => {
	const g = cleanGift({ chocolates }) as Gift;
	it("eats a chocolate once", () => {
		const once = eat(g, 1);
		expect(once?.chocolates?.eaten).toEqual([1]);
		expect(eat(once!, 1)).toBeNull();
		expect(chocolatesLeft(once!)).toEqual({ left: 2, total: 3 });
	});
	it("can't eat an empty cell, a cell outside the box, or from a gift without chocolates", () => {
		for (const i of [2, 4, -1, 1.5, "0"]) expect(eat(g, i)).toBeNull();
		expect(eat({ bouquet: cleanGift({ bouquet })!.bouquet }, 0)).toBeNull();
		expect(chocolatesLeft(undefined)).toBeNull();
	});
});
