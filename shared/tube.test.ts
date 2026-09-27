import { describe, expect, it } from "vitest";
import { parseYouTube, tubeAt } from "./tube";

describe("parseYouTube", () => {
	it("reads every usual link", () => {
		for (const url of [
			"https://www.youtube.com/watch?v=dQw4w9WgXcQ",
			"https://youtube.com/watch?v=dQw4w9WgXcQ&t=42s&list=PL123",
			"youtu.be/dQw4w9WgXcQ?si=abc",
			"https://m.youtube.com/watch?v=dQw4w9WgXcQ",
			"https://music.youtube.com/watch?v=dQw4w9WgXcQ&feature=share",
			"https://www.youtube.com/shorts/dQw4w9WgXcQ",
			"https://www.youtube.com/embed/dQw4w9WgXcQ",
			"https://www.youtube.com/live/dQw4w9WgXcQ?feature=share",
			"dQw4w9WgXcQ",
		])
			expect(parseYouTube(url), url).toBe("dQw4w9WgXcQ");
	});
	it("rejects anything else", () => {
		for (const url of ["https://vimeo.com/12345", "https://youtube.com/watch?v=short", "https://evil.com/watch?v=dQw4w9WgXcQ", "not a link", ""]) expect(parseYouTube(url), url).toBeNull();
	});
});

describe("tubeAt", () => {
	it("moves on while playing, holds while paused", () => {
		expect(tubeAt({ pos: 10, at: 1000, playing: true }, 4000)).toBe(13);
		expect(tubeAt({ pos: 10, at: 1000, playing: false }, 4000)).toBe(10);
		expect(tubeAt({ pos: 10, at: 5000, playing: true }, 4000)).toBe(10); // a clock slightly behind never rewinds
	});
});
