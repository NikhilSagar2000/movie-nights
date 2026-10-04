import { describe, expect, it } from "vitest";
import { keptPics, picFrom, picSlot } from "./pic";
import type { Pic } from "./types";

const pic = (id: string, from: "a" | "b", day: string, seenAt?: number): Pic => ({
	id,
	from,
	day,
	note: "",
	at: 0,
	...(seenAt ? { seenAt } : {}),
});

describe("picSlot", () => {
	it("is new when you haven't sent one today", () => {
		expect(picSlot([pic("1", "a", "2026-10-03"), pic("2", "b", "2026-10-04")], "a", "2026-10-04")).toBe("new");
	});
	it("replaces today's until they've seen it, then locks", () => {
		const today = pic("1", "a", "2026-10-04");
		expect(picSlot([today], "a", "2026-10-04")).toEqual({ replace: today });
		expect(picSlot([pic("1", "a", "2026-10-04", 5)], "a", "2026-10-04")).toBe("locked");
	});
});

describe("picFrom", () => {
	it("shows today's, even once seen", () => {
		expect(picFrom([pic("1", "b", "2026-10-04", 5)], "b", "2026-10-04")?.id).toBe("1");
	});
	it("keeps an unseen one from an earlier day up until they see it", () => {
		expect(picFrom([pic("1", "b", "2026-10-03")], "b", "2026-10-04")?.id).toBe("1");
		expect(picFrom([pic("1", "b", "2026-10-03", 5)], "b", "2026-10-04")).toBeUndefined();
	});
	it("prefers the newest", () => {
		expect(picFrom([pic("1", "b", "2026-10-03"), pic("2", "b", "2026-10-04", 5)], "b", "2026-10-04")?.id).toBe("2");
	});
	it("only looks at that person's", () => {
		expect(picFrom([pic("1", "a", "2026-10-04")], "b", "2026-10-04")).toBeUndefined();
	});
});

describe("keptPics", () => {
	it("keeps only what's on the fridge: one each at most", () => {
		const pics = [pic("old", "a", "2026-10-02", 5), pic("lost", "a", "2026-10-03"), pic("mine", "a", "2026-10-04"), pic("theirs", "b", "2026-10-03")];
		expect(keptPics(pics, "2026-10-04").map((p) => p.id)).toEqual(["mine", "theirs"]);
	});
	it("drops yesterday's once seen", () => {
		expect(keptPics([pic("1", "b", "2026-10-03", 5)], "2026-10-04")).toEqual([]);
	});
});
