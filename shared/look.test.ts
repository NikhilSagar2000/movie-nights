import { describe, expect, it } from "vitest";
import { bareLook, cleanLook } from "./look";

const full = { skin: "#FFE4CF", hair: "#8a4b35", head: { id: "beanie", c: "#b46a72" }, eyes: { id: "hearts", c: "#e27d93" }, cheeks: { id: "blush", c: "#f4a3b4" }, clip: { id: "bow", c: "#e27d93" } };

describe("cleanLook", () => {
	it("keeps a real look, colours lowercased", () => {
		expect(cleanLook(full, "a")).toEqual({ ...full, skin: "#ffe4cf" });
	});
	it("drops unknown items, items in the wrong slot, and bad colours", () => {
		const l = cleanLook({ ...full, head: { id: "crown", c: "#f2c95e" }, eyes: { id: "beanie", c: "#b46a72" }, cheeks: { id: "blush", c: "red" }, hair: "url(x)" }, "b");
		expect(l).toMatchObject({ head: null, eyes: null, cheeks: null, hair: null, clip: full.clip });
	});
	it("lets only cat ears match the hair", () => {
		expect(cleanLook({ head: { id: "cat", c: "hair" } }, "b")?.head).toEqual({ id: "cat", c: "hair" });
		expect(cleanLook({ clip: { id: "bow", c: "hair" } }, "b")?.clip).toBeNull();
	});
	it("gives round specs only to her", () => {
		expect(cleanLook({ eyes: { id: "specs", c: "#b46a72" } }, "b")?.eyes).toEqual({ id: "specs", c: "#b46a72" });
		expect(cleanLook({ eyes: { id: "specs", c: "#b46a72" } }, "a")?.eyes).toBeNull();
	});
	it("fills what's missing, drops extra keys, and refuses non-looks", () => {
		expect(cleanLook({ extra: 1, head: { id: "halo", c: "#f2c95e", x: "y" } }, "a")).toEqual({ skin: null, hair: null, head: { id: "halo", c: "#f2c95e" }, eyes: null, cheeks: null, clip: null });
		for (const v of [null, "look", 3, [full]]) expect(cleanLook(v, "a")).toBeNull();
	});
});

describe("bareLook", () => {
	it("gives him his flower and her nothing", () => {
		expect(bareLook("a").clip).toEqual({ id: "flower", c: "#f7dd8d" });
		expect(bareLook("b").clip).toBeNull();
		expect(cleanLook(bareLook("a"), "a")).toEqual(bareLook("a"));
	});
});
