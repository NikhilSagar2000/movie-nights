import { other, type Who } from "../../shared/types";
import { COLOURS, ludoInit, turnOf, type Colour, type Last, type Ludo } from "./ludoState";
export { COLOURS, ludoInit, ludoStatus, turnOf, type Colour, type Ludo } from "./ludoState";

/* Ludo, Ludo King rules, as pure functions on the shared state (no React, no network).
   The board is 15×15. Points are square centres in board units (0–15), [x, y]. Rose sits top left; the others follow
   clockwise, each one the board turned a quarter. A token's progress: -1 in its yard, 0–50 round the ring (0 = its
   start), 51–55 up its home column, 56 home. */

export const HOME = 56;
const YARD = -1;
const RING_LEN = 52;

export type Pt = [x: number, y: number];
/** A point with the board turned a quarter clockwise `quarters` times. */
export const turned = ([x, y]: Pt, quarters: number): Pt => (quarters ? turned([15 - y, x], quarters - 1) : [x, y]);
const at = (row: number, col: number): Pt => [col + 0.5, row + 0.5];
const k = (c: Colour) => COLOURS.indexOf(c);

// Rose's quarter of the ring, from her start square (row 6, col 1) clockwise; the other three are it turned.
const QUARTER: Pt[] = [
	at(6, 1), at(6, 2), at(6, 3), at(6, 4), at(6, 5),
	at(5, 6), at(4, 6), at(3, 6), at(2, 6), at(1, 6), at(0, 6),
	at(0, 7), at(0, 8),
];
export const RING: Pt[] = [0, 1, 2, 3].flatMap((q) => QUARTER.map((p) => turned(p, q)));
const startOf = (c: Colour) => 13 * k(c);
/** Ring squares nobody can be captured on: every start, and the square 8 past it (drawn as flowers). */
export const SAFE = new Set([0, 8, 13, 21, 26, 34, 39, 47]);
/** A token's ring square (0–51), or null off the ring. */
export const squareOf = (c: Colour, p: number) => (p >= 0 && p <= 50 ? (startOf(c) + p) % RING_LEN : null);

const YARD_SPOTS: Pt[] = [[2, 2], [4, 2], [2, 4], [4, 4]];
/** Where a token stands. Home: tucked into its triangle in the middle. */
export function pointOf(c: Colour, p: number, i: number): Pt {
	if (p === YARD) return turned(YARD_SPOTS[i], k(c));
	const sq = squareOf(c, p);
	if (sq !== null) return RING[sq];
	if (p < HOME) return turned(at(7, p - 50), k(c));
	return turned([6.42, [7.25, 7.75, 6.75, 8.25][i]], k(c));
}

export const opposite = (c: Colour) => COLOURS[(k(c) + 2) % 4];
const seated = (s: Ludo) => COLOURS.filter((c) => s.seats[c]);
export const coloursOf = (s: Ludo, w: Who) => COLOURS.filter((c) => s.seats[c] === w);

// ---------- setup ----------
/** Everyone's seats from one pick: the picker's colour (with 4, the one across too); the other gets the one across (with
 *  4, the other two). So turns always go one of you, then the other. */
function seatsFor(n: 2 | 4, c: Colour, w: Who): Ludo["seats"] {
	const across = opposite(c);
	return Object.fromEntries(COLOURS.flatMap((x) => (x === c || (n === 4 && x === across) ? [[x, w]] : n === 4 || x === across ? [[x, other(w)]] : [])));
}
export const setColours = (s: Ludo, n: 2 | 4): Ludo | null =>
	s.phase === "setup" && s.colours !== n ? { ...s, colours: n, seats: s.pick ? seatsFor(n, s.pick, s.seats[s.pick]!) : {} } : null;
export const setTokens = (s: Ludo, n: 2 | 4): Ludo | null => (s.phase === "setup" && s.tokens !== n ? { ...s, tokens: n } : null);
/** One tap picks a colour for you, and that seats you both (either of you can pick, or pick again). */
export const seat = (s: Ludo, c: Colour, w: Who): Ludo | null => (s.phase === "setup" && !(s.pick === c && s.seats[c] === w) ? { ...s, pick: c, seats: seatsFor(s.colours, c, w) } : null);
/** Your colour, from your seats: the one you picked; with 4, if they picked, the one after theirs; else your first.
 *  (Seats alone are enough, so a game started before picks were kept still knows whose colour is whose.) */
export function mainOf(s: Ludo, w: Who): Colour | null {
	const mine = coloursOf(s, w);
	if (s.pick && mine.includes(s.pick)) return s.pick;
	const next = s.pick && COLOURS[(k(s.pick) + 1) % 4];
	return next && mine.includes(next) ? next : (mine[0] ?? null);
}
/** Quarter turns that bring your colour to the bottom left of your screen (rose's corner is the top left). */
export const viewOf = (s: Ludo, w: Who) => {
	const mine = mainOf(s, w);
	return mine ? (7 - k(mine)) % 4 : 0;
};
export const ready = (s: Ludo) => s.phase === "setup" && coloursOf(s, "a").length === s.colours / 2 && coloursOf(s, "b").length === s.colours / 2;
export function start(s: Ludo): Ludo | null {
	if (!ready(s)) return null;
	const pos = Object.fromEntries(seated(s).map((c) => [c, Array(s.tokens).fill(YARD)]));
	return { ...s, phase: "play", pos, turn: coloursOf(s, s.starter)[0], roll: null, die: 0, sixes: 0, rolls: 0, again: false, last: undefined, winner: undefined };
}
/** Play again: back to setup with the same choices, the other one rolling first. */
export const rematch = (s: Ludo): Ludo => ({ ...ludoInit(other(s.starter)), colours: s.colours, tokens: s.tokens, seats: s.seats, pick: s.pick });

// ---------- play ----------
export function roll(s: Ludo, n: number): Ludo | null {
	if (s.phase !== "play" || s.roll !== null || !(n >= 1 && n <= 6)) return null;
	return { ...s, roll: n, die: n, rolls: s.rolls + 1, sixes: n === 6 ? s.sixes + 1 : 0 };
}
/** The moves this roll allows, one per starting square (tokens stacked together move the same). Three 6s: none. */
export function movesOf(s: Ludo): { i: number; from: number; to: number }[] {
	const r = s.roll;
	if (s.phase !== "play" || r === null || s.sixes >= 3) return [];
	const seen = new Set<number>();
	return (s.pos[s.turn] ?? []).flatMap((from, i) => {
		const to = from === YARD ? (r === 6 ? 0 : null) : from + r <= HOME ? from + r : null;
		if (to === null || from === HOME || seen.has(from)) return [];
		seen.add(from);
		return [{ i, from, to }];
	});
}
const nextTurn = (s: Ludo): Ludo => {
	const order = seated(s);
	return { ...s, turn: order[(order.indexOf(s.turn) + 1) % order.length], roll: null, sixes: 0, again: false };
};
/** The roll can't be used: the next colour's turn (a 6 that can't be used still rolls again; a third 6 never does). */
export function pass(s: Ludo): Ludo | null {
	if (s.roll === null || movesOf(s).length) return null;
	return s.roll === 6 && s.sixes < 3 ? { ...s, roll: null, again: true } : nextTurn(s);
}
/** Move token `i` by the roll: captures, a bonus roll (6, a capture, or getting home), the win. */
export function move(s: Ludo, i: number): Ludo | null {
	const m = movesOf(s).find((x) => x.from === s.pos[s.turn]?.[i]);
	if (!m) return null;
	const me = s.seats[s.turn]!;
	const pos = Object.fromEntries(Object.entries(s.pos).map(([c, ps]) => [c, [...ps]])) as Ludo["pos"];
	pos[s.turn]![i] = m.to;
	const hit: Last["hit"] = [];
	const sq = squareOf(s.turn, m.to);
	if (sq !== null && !SAFE.has(sq))
		for (const c of COLOURS.filter((c) => s.seats[c] && s.seats[c] !== me))
			pos[c]!.forEach((p, j) => {
				if (squareOf(c, p) === sq) {
					hit.push({ colour: c, i: j, from: p });
					pos[c]![j] = YARD;
				}
			});
	const moved: Ludo = { ...s, pos, roll: null, last: { colour: s.turn, i, from: m.from, to: m.to, hit, n: s.rolls } };
	if (coloursOf(s, me).every((c) => pos[c]!.every((p) => p === HOME))) return { ...moved, phase: "done", winner: me };
	return s.roll === 6 || hit.length || m.to === HOME ? { ...moved, again: true } : nextTurn(moved);
}
