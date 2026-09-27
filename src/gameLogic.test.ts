import { describe, expect, it } from "vitest";
import * as g from "./gameLogic";

describe("word matching", () => {
	it("mind meld normalizes", () => {
		expect(g.mindMeldMatch(" Pizza!", "pizza")).toBe(true);
		expect(g.mindMeldMatch("Crème  Brûlée", "creme brulee")).toBe(true);
		expect(g.mindMeldMatch("🍕", "🍕")).toBe(true);
		expect(g.mindMeldMatch("cat", "dog")).toBe(false);
		expect(g.mindMeldMatch("  ", "  ")).toBe(false);
	});
	it("keeps Hindi vowel signs (दिल ≠ दल), still matches the same Hindi word", () => {
		expect(g.mindMeldMatch("दिल", "दल")).toBe(false);
		expect(g.mindMeldMatch("पानी", "पिन")).toBe(false);
		expect(g.mindMeldMatch(" दिल! ", "दिल")).toBe(true);
		expect(g.guessMatches("दाल", "दिल")).toBe(false);
	});
	it("guesses forgive plurals, articles and spacing", () => {
		for (const [guess, word] of [["cats", "cat"], ["Berries", "berry"], ["a Pizza", "pizza"], ["hotdog", "hot dog"], ["buses", "bus"], ["ice-cream", "ice cream"]])
			expect(g.guessMatches(guess, word), guess).toBe(true);
		expect(g.guessMatches("bat", "cat")).toBe(false);
		expect(g.guessMatches("", "cat")).toBe(false);
	});
});

describe("emoji only", () => {
	it("drops letters and digits, keeps emoji, flags and keycaps", () => {
		expect(g.emojiOnly("🎬 titanic 🚢❤️")).toBe("🎬 🚢❤️");
		expect(g.emojiOnly("3 idiots 3️⃣🤓🤓🤓")).toBe("3️⃣🤓🤓🤓");
		expect(g.emojiOnly("🇮🇳 India")).toBe("🇮🇳 ");
		expect(g.emojiOnly("👨‍👩‍👧 family")).toBe("👨‍👩‍👧 ");
		expect(g.emojiOnly("abc")).toBe("");
	});
	it("caps the length", () => {
		expect([...new Intl.Segmenter().segment(g.emojiOnly("😀".repeat(60)))].length).toBe(40);
	});
});

describe("same wave zones", () => {
	it("grades the distance", () => {
		expect(g.waveZone(50, 53)).toBe("bullseye");
		expect(g.waveZone(50, 60)).toBe("close");
		expect(g.waveZone(10, 28)).toBe("near");
		expect(g.waveZone(0, 100)).toBe("far");
	});
});
