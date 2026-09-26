// Pure game rules: no React, no network. The mover computes the next state and sends all of it.
import { other, type Stroke, type Who } from "../shared/types";

export type Cell = Who | null;
export type Outcome = { who: Who; line: number[] } | "draw" | null;

/** Board state shared by tic-tac-toe and Connect Four. `starter` lets "Play again" alternate who opens. */
export type Grid = { board: Cell[]; turn: Who; starter: Who };

const DIRS = [
	[1, 0],
	[0, 1],
	[1, 1],
	[1, -1],
];

/** First run of `n` same-player cells on a row-major cols×rows board, else "draw" once it's full, else null. */
export function lineWinner(board: Cell[], cols: number, rows: number, n: number): Outcome {
	for (let r = 0; r < rows; r++)
		for (let c = 0; c < cols; c++) {
			const who = board[r * cols + c];
			if (!who) continue;
			for (const [dc, dr] of DIRS) {
				const pts = Array.from({ length: n }, (_, k) => [c + dc * k, r + dr * k]);
				if (pts.every(([x, y]) => x >= 0 && x < cols && y >= 0 && y < rows && board[y * cols + x] === who))
					return { who, line: pts.map(([x, y]) => y * cols + x) };
			}
		}
	return board.every(Boolean) ? "draw" : null;
}

function place(s: Grid, i: number, who: Who, over: boolean): Grid | null {
	if (over || s.turn !== who || s.board[i] !== null) return null; // also rejects i off the board (undefined)
	const board = s.board.slice();
	board[i] = who;
	return { ...s, board, turn: other(who) };
}

// ---- Tic-tac-toe ----
export const tttInit = (starter: Who): Grid => ({ board: Array(9).fill(null), turn: starter, starter });
export const tttWinner = (board: Cell[]) => lineWinner(board, 3, 3, 3);
export const tttMove = (s: Grid, i: number, who: Who) => place(s, i, who, !!tttWinner(s.board));

// ---- Connect Four: 7 columns × 6 rows, row 0 is the top ----
export const C4_COLS = 7;
export const C4_ROWS = 6;
export const c4Init = (starter: Who): Grid => ({ board: Array(C4_COLS * C4_ROWS).fill(null), turn: starter, starter });
export const c4Winner = (board: Cell[]) => lineWinner(board, C4_COLS, C4_ROWS, 4);
export function c4Move(s: Grid, col: number, who: Who): Grid | null {
	if (!Number.isInteger(col) || col < 0 || col >= C4_COLS) return null;
	let r = C4_ROWS - 1;
	while (r >= 0 && s.board[r * C4_COLS + col]) r--;
	return r < 0 ? null : place(s, r * C4_COLS + col, who, !!c4Winner(s.board));
}

// ---- Memory match ----
export const MEMORY_FACES = ["🌙", "💗", "🍿", "🎬", "🌸", "🍓", "🎀", "⭐"];
/** `found` maps card index → who found it (JSON turns the keys into strings; lookups still work). */
export type Memory = { deck: string[]; up: number[]; found: Record<number, Who>; turn: Who; starter: Who };

export function shuffle<T>(xs: T[], rand = Math.random): T[] {
	const a = xs.slice();
	for (let i = a.length - 1; i > 0; i--) {
		const j = Math.floor(rand() * (i + 1));
		[a[i], a[j]] = [a[j], a[i]];
	}
	return a;
}

export const memoryInit = (starter: Who, rand = Math.random): Memory => ({
	deck: shuffle([...MEMORY_FACES, ...MEMORY_FACES], rand),
	up: [],
	found: {},
	turn: starter,
	starter,
});

/** A match is claimed at once and the same player goes again; a miss leaves both cards up for memoryFlipBack. */
export function memoryFlip(s: Memory, i: number, who: Who): Memory | null {
	if (s.turn !== who || s.up.length >= 2 || s.deck[i] === undefined || s.found[i] || s.up.includes(i)) return null;
	const up = [...s.up, i];
	if (up.length === 2 && s.deck[up[0]] === s.deck[i]) return { ...s, up: [], found: { ...s.found, [up[0]]: who, [i]: who } };
	return { ...s, up };
}
export const memoryFlipBack = (s: Memory): Memory => ({ ...s, up: [], turn: other(s.turn) });
export const memoryDone = (s: Memory) => Object.keys(s.found).length === s.deck.length;

// ---- Rock paper scissors (answers come from game.reveals) ----
export const HANDS = ["rock", "paper", "scissors"] as const;
export type Hand = (typeof HANDS)[number];
const BEATS: Record<string, string> = { rock: "scissors", paper: "rock", scissors: "paper" };
export const rpsResult = (a: string, b: string): Who | "tie" => (a === b ? "tie" : BEATS[a] === b ? "a" : "b");

// ---- Word matching (Mind Meld + Doodle) ----
/** Lowercase, no Latin accents, no punctuation, single spaces. Marks in other scripts (Hindi vowel signs) are letters, so they stay. */
export const normalize = (s: string) =>
	s
		.normalize("NFD")
		.replace(/(?<=\p{Script=Latin})\p{M}+/gu, "")
		.toLowerCase()
		.replace(/[^\p{L}\p{M}\p{N}\s]/gu, "")
		.replace(/\s+/g, " ")
		.trim();

// Drops a leading article and all spaces ("the hot dog" = "hotdog"); emoji-only answers fall back to themselves.
const key = (s: string) => normalize(s).replace(/^(a|an|the) /, "").replace(/ /g, "") || s.trim();
const forms = (w: string) => [w, w + "s", w + "es", w.replace(/y$/, "ies")];

/** Same word, forgiving case, accents, punctuation, spacing, articles and simple plurals (cat/cats, berry/berries). */
export function sameWord(x: string, y: string) {
	const a = key(x);
	const b = key(y);
	return a !== "" && (forms(a).includes(b) || forms(b).includes(a));
}
export const mindMeldMatch = sameWord;
export const guessMatches = (guess: string, word: string) => sameWord(guess, word);

// ---- Doodle & Guess ----
export type Doodle = { drawer: Who; round: number; last?: { word: string; guessedBy: Who } };
export const doodleInit = (starter: Who): Doodle => ({ drawer: starter, round: 0 });
export const doodleSolved = (s: Doodle, word: string, by: Who): Doodle => ({ drawer: other(s.drawer), round: s.round + 1, last: { word, guessedBy: by } });

export const WORDS = [
	"kitten", "pizza", "rainbow", "cat", "sun", "popcorn", "heart", "balloon", "flower", "moon",
	"star", "cloud", "house", "tree", "fish", "dog", "robot", "cake", "ice cream", "cupcake",
	"donut", "cookie", "apple", "banana", "strawberry", "cherry", "carrot", "bee", "butterfly", "snail",
	"ladybug", "duck", "frog", "penguin", "owl", "turtle", "whale", "octopus", "snowman", "umbrella",
	"rocket", "car", "bicycle", "boat", "train", "kite", "guitar", "crown", "ring", "gift",
	"candle", "glasses", "hat", "sock", "key", "book", "teapot", "lollipop", "mushroom", "cactus",
	"mountain", "island", "volcano", "sunflower", "lighthouse", "tent", "camera", "television", "pencil", "clock",
	"bed", "pillow", "dinosaur", "unicorn", "ghost", "egg", "hot dog", "burger", "pineapple", "watermelon",
	"bow", "envelope", "spider", "igloo",
]; // prettier-ignore

export function pickWord(exclude: string[] = [], rand = Math.random) {
	const pool = WORDS.filter((w) => !exclude.includes(w));
	return pool[Math.floor(rand() * pool.length)];
}

/** Split strokes into relay-sized batches of ≤ max points; long strokes are cut with a shared point so lines stay joined. */
export function chunkStrokes(strokes: Stroke[], max = 2000): Stroke[][] {
	const pieces = strokes.flatMap((s) => {
		const out: Stroke[] = [];
		for (let i = 0; i === 0 || i < s.x.length - 1; i += max - 1) out.push({ ...s, x: s.x.slice(i, i + max), y: s.y.slice(i, i + max) });
		return out;
	});
	const batches: Stroke[][] = [];
	let n = Infinity;
	for (const p of pieces) {
		if (n + p.x.length > max) {
			batches.push([]);
			n = 0;
		}
		batches[batches.length - 1].push(p);
		n += p.x.length;
	}
	return batches;
}
