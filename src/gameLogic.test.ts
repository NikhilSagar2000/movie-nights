import { describe, expect, it } from "vitest";
import type { Who } from "../shared/types";
import * as g from "./gameLogic";

const grid = (cells: [number, number][], who: Who = "a") => {
	const board: g.Cell[] = Array(42).fill(null);
	for (const [c, r] of cells) board[r * 7 + c] = who;
	return board;
};
const dropAll = (cols: number[]) => cols.reduce((s, c) => g.c4Move(s, c, s.turn)!, g.c4Init("a"));

describe("tic-tac-toe", () => {
	it("wins a row and rejects illegal moves", () => {
		let s = g.tttInit("a");
		expect(g.tttMove(s, 0, "b")).toBeNull(); // not b's turn
		for (const [i, w] of [[0, "a"], [3, "b"], [1, "a"], [4, "b"]] as const) s = g.tttMove(s, i, w)!;
		expect(g.tttMove(s, 0, "a")).toBeNull(); // taken
		expect(g.tttMove(s, 9, "a")).toBeNull(); // off the board
		s = g.tttMove(s, 2, "a")!;
		expect(g.tttWinner(s.board)).toEqual({ who: "a", line: [0, 1, 2] });
		expect(g.tttMove(s, 5, "b")).toBeNull(); // game over
	});
	it("detects a draw and the diagonal", () => {
		expect(g.tttWinner(["a", "b", "a", "a", "b", "b", "b", "a", "a"])).toBe("draw");
		expect(g.tttWinner(["b", "a", null, "a", "b", null, null, null, "b"])).toEqual({ who: "b", line: [0, 4, 8] });
		expect(g.tttWinner(g.tttInit("b").board)).toBeNull();
	});
});

describe("connect four", () => {
	it("drops with gravity and rejects a full column", () => {
		const s = dropAll([3, 3]);
		expect(s.board[38]).toBe("a");
		expect(s.board[31]).toBe("b");
		expect(g.c4Move(dropAll([0, 0, 0, 0, 0, 0]), 0, "a")).toBeNull();
		expect(g.c4Move(g.c4Init("a"), 7, "a")).toBeNull();
	});
	it("finds horizontal, vertical and both diagonals", () => {
		expect(g.c4Winner(dropAll([0, 0, 1, 1, 2, 2, 3]).board)).toEqual({ who: "a", line: [35, 36, 37, 38] });
		expect(g.c4Winner(dropAll([0, 1, 0, 1, 0, 1, 0]).board)).toEqual({ who: "a", line: [14, 21, 28, 35] });
		expect(g.c4Winner(grid([[0, 5], [1, 4], [2, 3], [3, 2]]))).toEqual({ who: "a", line: [35, 29, 23, 17] });
		expect(g.c4Winner(grid([[2, 1], [3, 2], [4, 3], [5, 4]], "b"))).toEqual({ who: "b", line: [9, 17, 25, 33] });
	});
	it("calls a full board with no four a draw", () => {
		const board = Array.from({ length: 42 }, (_, i): Who => ((i % 7) + 2 * (Math.floor(i / 7) % 2)) % 4 < 2 ? "a" : "b");
		expect(g.c4Winner(board)).toBe("draw");
	});
});

describe("memory", () => {
	it("deals 8 shuffled pairs", () => {
		const s = g.memoryInit("b");
		expect(s.deck).toHaveLength(16);
		expect([...s.deck].sort()).toEqual([...g.MEMORY_FACES, ...g.MEMORY_FACES].sort());
		expect(s.turn).toBe("b");
	});
	it("a match keeps the turn, a miss waits for the flip-back", () => {
		let s: g.Memory = { deck: ["x", "x", "y", "z", "y", "z"], up: [], found: {}, turn: "a", starter: "a" };
		expect(g.memoryFlip(s, 0, "b")).toBeNull();
		s = g.memoryFlip(s, 0, "a")!;
		expect(g.memoryFlip(s, 0, "a")).toBeNull(); // same card twice
		s = g.memoryFlip(s, 1, "a")!;
		expect(s).toMatchObject({ up: [], found: { 0: "a", 1: "a" }, turn: "a" });
		expect(g.memoryFlip(s, 1, "a")).toBeNull(); // already found
		s = g.memoryFlip(g.memoryFlip(s, 2, "a")!, 3, "a")!;
		expect(s.up).toEqual([2, 3]);
		expect(g.memoryFlip(s, 4, "a")).toBeNull(); // two cards already up
		s = g.memoryFlipBack(s);
		expect(s).toMatchObject({ up: [], turn: "b" });
		s = g.memoryFlip(g.memoryFlip(s, 2, "b")!, 4, "b")!;
		s = g.memoryFlip(g.memoryFlip(s, 3, "b")!, 5, "b")!;
		expect(g.memoryDone(s)).toBe(true);
		expect(s.found).toMatchObject({ 2: "b", 3: "b" });
	});
});

describe("rock paper scissors", () => {
	it("covers all 9 combos", () => {
		const table = { rock: ["tie", "b", "a"], paper: ["a", "tie", "b"], scissors: ["b", "a", "tie"] } as const;
		for (const a of g.HANDS) g.HANDS.forEach((b, i) => expect(g.rpsResult(a, b), `${a} v ${b}`).toBe(table[a][i]));
	});
});

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
	it("doodle guesses forgive plurals, articles and spacing", () => {
		for (const [guess, word] of [["cats", "cat"], ["Berries", "berry"], ["a Pizza", "pizza"], ["hotdog", "hot dog"], ["buses", "bus"], ["ice-cream", "ice cream"]])
			expect(g.guessMatches(guess, word), guess).toBe(true);
		expect(g.guessMatches("bat", "cat")).toBe(false);
		expect(g.guessMatches("", "cat")).toBe(false);
	});
	it("picks unique words and honors exclusions", () => {
		expect(g.WORDS.length).toBeGreaterThanOrEqual(80);
		expect(new Set(g.WORDS).size).toBe(g.WORDS.length);
		expect(g.pickWord(g.WORDS.slice(1))).toBe(g.WORDS[0]);
		expect(g.doodleSolved(g.doodleInit("a"), "cat", "b")).toEqual({ drawer: "b", round: 1, last: { word: "cat", guessedBy: "b" } });
	});
});

describe("stroke chunking", () => {
	it("keeps batches small and long strokes joined", () => {
		const long = { x: Array.from({ length: 5000 }, (_, i) => i), y: Array(5000).fill(0), color: "#000", size: 0.01 };
		const batches = g.chunkStrokes([long, { ...long, x: [1], y: [1] }], 2000);
		for (const b of batches) expect(b.reduce((n, s) => n + s.x.length, 0)).toBeLessThanOrEqual(2000);
		const [p1, p2, p3, dot] = batches.flat();
		expect([p1.x.at(-1), p2.x.at(-1), p3.x.at(-1)]).toEqual([p2.x[0], p3.x[0], 4999]); // each piece starts where the last ended
		expect(dot.x).toEqual([1]);
	});
});
