import { describe, expect, it } from "vitest";
import { clock, dayOf, hitsOf, searchKey, secsOf, slotFor, songFrom, unescape } from "./song";
import type { Song } from "./types";

describe("searchKey", () => {
	it("needs at least 4 letters; spaces don't count", () => {
		expect(searchKey("kes")).toBe("");
		expect(searchKey("  k e s  ")).toBe("");
		expect(searchKey("     ")).toBe("");
		expect(searchKey("kesa")).toBe("kesa");
		expect(searchKey(42)).toBe("");
	});
	it("trims, lowercases, collapses spaces and caps the length", () => {
		expect(searchKey("  Tum   Hi\tHo  ")).toBe("tum hi ho");
		expect(searchKey("a".repeat(200))).toHaveLength(80);
	});
});

describe("secsOf / clock / unescape", () => {
	it("reads YouTube durations", () => {
		expect(secsOf("PT4M28S")).toBe(268);
		expect(secsOf("PT1H2M3S")).toBe(3723);
		expect(secsOf("PT45S")).toBe(45);
		expect(secsOf("P0D")).toBe(0);
		expect(secsOf("4:28")).toBe(0);
		expect(secsOf(undefined)).toBe(0);
	});
	it("formats times", () => {
		expect(clock(268)).toBe("4:28");
		expect(clock(5.9)).toBe("0:05");
		expect(clock(-3)).toBe("0:00");
	});
	it("unescapes titles, and leaves junk alone", () => {
		expect(unescape("Rock &amp; Roll &#39;Live&#39; &quot;x&quot; &#x27;y&#x27;")).toBe(`Rock & Roll 'Live' "x" 'y'`);
		expect(unescape("&nope; &#99999999;")).toBe("&nope; &#99999999;");
	});
});

describe("hitsOf", () => {
	const item = (videoId: unknown, title = "Kesariya &amp; more", channelTitle = "Sony Music India") => ({ id: { videoId }, snippet: { title, channelTitle } });
	const vid = (id: string, duration: string) => ({ id, contentDetails: { duration } });
	it("keeps real songs in search order, with clean titles and durations", () => {
		const hits = hitsOf({ items: [item("bbbbbbbbbbb"), item("aaaaaaaaaaa", "Tum Hi Ho")] }, { items: [vid("aaaaaaaaaaa", "PT4M22S"), vid("bbbbbbbbbbb", "PT4M28S")] });
		expect(hits).toEqual([
			{ vid: "bbbbbbbbbbb", title: "Kesariya & more", channel: "Sony Music India", secs: 268 },
			{ vid: "aaaaaaaaaaa", title: "Tum Hi Ho", channel: "Sony Music India", secs: 262 },
		]);
	});
	it("drops bad ids, missing or live durations, Shorts, jukebox mixes and repeats", () => {
		const search = { items: [item("short"), item("ccccccccccc"), item("ddddddddddd"), item("eeeeeeeeeee"), item("ggggggggggg"), item("fffffffffff"), item("fffffffffff"), item(7)] };
		const videos = { items: [vid("ddddddddddd", "P0D"), vid("eeeeeeeeeee", "PT1H2M"), vid("ggggggggggg", "PT57S"), vid("fffffffffff", "PT3M")] };
		expect(hitsOf(search, videos).map((h) => h.vid)).toEqual(["fffffffffff"]);
	});
	it("survives junk answers", () => {
		expect(hitsOf(null, undefined)).toEqual([]);
		expect(hitsOf({ items: "x" }, { items: [null] })).toEqual([]);
	});
});

describe("the daily slot", () => {
	const song = (from: "a" | "b", day: string, playedAt?: number): Song => ({ id: from + day, vid: "aaaaaaaaaaa", title: "t", channel: "c", from, day, note: "", at: 0, ...(playedAt && { playedAt }) });
	it("new, swappable until played, then locked; each person has their own", () => {
		const songs = [song("a", "2026-09-29", 1), song("b", "2026-09-30")];
		expect(slotFor(songs, "a", "2026-09-30")).toBe("new");
		expect(slotFor(songs, "b", "2026-09-30")).toEqual({ replace: songs[1] });
		expect(slotFor([...songs, song("a", "2026-09-30", 5)], "a", "2026-09-30")).toBe("locked");
	});
	it("shows today's song, else the newest one still waiting", () => {
		const waiting = song("b", "2026-09-28");
		expect(songFrom([waiting, song("b", "2026-09-29", 1)], "b", "2026-09-30")).toBe(waiting);
		const today = song("b", "2026-09-30", 9);
		expect(songFrom([waiting, today], "b", "2026-09-30")).toBe(today);
		expect(songFrom([song("b", "2026-09-29", 1)], "b", "2026-09-30")).toBeUndefined();
	});
	it("days turn at India's midnight (and Pacific's, for the search count)", () => {
		expect(dayOf(Date.UTC(2026, 8, 29, 18, 29))).toBe("2026-09-29"); // 23:59 in India
		expect(dayOf(Date.UTC(2026, 8, 29, 18, 30))).toBe("2026-09-30"); // 00:00 in India
		expect(dayOf(Date.UTC(2026, 8, 30, 6, 59), "America/Los_Angeles")).toBe("2026-09-29");
		expect(dayOf(Date.UTC(2026, 8, 30, 7, 0), "America/Los_Angeles")).toBe("2026-09-30");
	});
});
