import { describe, expect, it } from "vitest";
import { clock, decodeSubs, order, routeOf, srtToVtt, titleOf } from "./filmLogic";

describe("srtToVtt", () => {
	it("turns an .srt into WebVTT", () => {
		const srt = "﻿1\r\n00:00:01,000 --> 00:00:03,500\r\nHello there\r\nsecond line\r\n\r\n2\r\n0:01:02,250 --> 0:01:04,000\r\n{\\an8}On top\r\n";
		expect(srtToVtt(srt)).toBe(
			"WEBVTT\n\n1\n00:00:01.000 --> 00:00:03.500\nHello there\nsecond line\n\n2\n00:01:02.250 --> 00:01:04.000\nOn top",
		);
	});
	it("leaves a .vtt alone", () => {
		expect(srtToVtt("WEBVTT\n\n00:01.000 --> 00:02.000\nHi\n")).toBe("WEBVTT\n\n00:01.000 --> 00:02.000\nHi");
	});
});

describe("decodeSubs", () => {
	it("reads UTF-8, and falls back to Windows-1252", () => {
		expect(decodeSubs(new TextEncoder().encode("Café ñ"))).toBe("Café ñ");
		expect(decodeSubs(new Uint8Array([0x43, 0x61, 0x66, 0xe9]))).toBe("Café"); // "Café" saved as Windows-1252
	});
});

describe("order", () => {
	const f = (name: string, type = "") => ({ name, type });
	it("sorts episodes by number, not by letter", () => {
		const list = order([f("Show S01E10.mkv"), f("Show S01E2.mkv"), f("Show S01E1.mkv"), f("notes.txt", "text/plain")]);
		expect(list.map((e) => e.video.name)).toEqual(["Show S01E1.mkv", "Show S01E2.mkv", "Show S01E10.mkv"]);
	});
	it("matches subtitles by episode code, then by name", () => {
		const list = order([
			f("Show.S01E01.1080p.mkv"),
			f("Show.S01E10.1080p.mkv"),
			f("Show.S01E01.en.srt"),
			f("Show.S01E10.en.srt"),
			f("Show.S01E1.srt"),
			f("Movie.2019.1080p.mp4", "video/mp4"),
			f("Movie.2019.srt"),
		]);
		const subOf = (v: string) => list.find((e) => e.video.name === v)?.sub?.name ?? null;
		expect(subOf("Show.S01E01.1080p.mkv")).toBe("Show.S01E01.en.srt");
		expect(subOf("Show.S01E10.1080p.mkv")).toBe("Show.S01E10.en.srt"); // not "E1", which its name starts with
		expect(subOf("Movie.2019.1080p.mp4")).toBe("Movie.2019.srt");
	});
	it("pairs one video with one subtitle file, whatever their names", () => {
		expect(order([f("a.mkv"), f("english.srt")])[0].sub?.name).toBe("english.srt");
		expect(order([f("a.mkv"), f("b.mkv"), f("english.srt")]).every((e) => e.sub === null)).toBe(true);
	});
	it("tidies names into titles", () => {
		expect(titleOf("Show.S01E02.1080p.mkv")).toBe("Show S01E02 1080p");
		expect(titleOf("my_movie.mp4")).toBe("my movie");
	});
});

describe("routeOf", () => {
	const cands = (local: string, remote: string) => [
		{ id: "L", type: "local-candidate", candidateType: local },
		{ id: "R", type: "remote-candidate", candidateType: remote },
	];
	it("reads Chrome's selected pair", () => {
		const base = [{ id: "T", type: "transport", selectedCandidatePairId: "P" }, { id: "P", type: "candidate-pair", localCandidateId: "L", remoteCandidateId: "R" }];
		expect(routeOf([...base, ...cands("host", "srflx")])).toBe("direct");
		expect(routeOf([...base, ...cands("relay", "srflx")])).toBe("relay");
		expect(routeOf([...base, ...cands("host", "relay")])).toBe("relay");
	});
	it("falls back to the pair marked selected (Firefox)", () => {
		expect(routeOf([{ id: "P", type: "candidate-pair", selected: true, localCandidateId: "L", remoteCandidateId: "R" }, ...cands("relay", "host")])).toBe("relay");
	});
	it("says nothing before a pair is chosen", () => {
		expect(routeOf([{ id: "P", type: "candidate-pair", state: "in-progress", localCandidateId: "L", remoteCandidateId: "R" }, ...cands("host", "host")])).toBe(null);
	});
});

describe("clock", () => {
	it("shows minutes, and hours once there are any", () => {
		expect(clock(0)).toBe("0:00");
		expect(clock(723.9)).toBe("12:03");
		expect(clock(6730)).toBe("1:52:10");
		expect(clock(NaN)).toBe("0:00");
	});
});
