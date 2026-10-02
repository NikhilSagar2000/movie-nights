import { describe, expect, it } from "vitest";
import { COLOURS, HOME, RING, coloursOf, ludoInit, mainOf, move, movesOf, pass, pointOf, ready, rematch, roll, seat, setColours, setTokens, squareOf, start, turned, turnOf, viewOf, type Colour, type Ludo } from "./ludoLogic";

/** A game in play: rose (a) vs sun (b), or with `four`, rose+sun (a) vs sage+sky (b). */
function game(four = false, tokens: 2 | 4 = 4): Ludo {
	let s = ludoInit("a");
	if (four) s = setColours(s, 4)!;
	if (tokens === 2) s = setTokens(s, 2)!;
	s = seat(s, "rose", "a")!;
	s = seat(s, four ? "sage" : "sun", "b")!;
	return start(s)!;
}
const at = (s: Ludo, pos: Partial<Record<Colour, number[]>>, turn: Colour = s.turn): Ludo => ({ ...s, pos: { ...s.pos, ...pos }, turn });

describe("the board", () => {
	it("has a ring of 52 different squares, each a step from the last", () => {
		expect(RING).toHaveLength(52);
		expect(new Set(RING.map((p) => p.join())).size).toBe(52);
		RING.forEach((p, i) => {
			const q = RING[(i + 1) % 52];
			expect(Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1])).toBeLessThanOrEqual(2); // a step, or a diagonal at a corner
		});
	});
	it("starts each colour on its own arm, and runs its home column into the middle", () => {
		expect(pointOf("rose", 0, 0)).toEqual([1.5, 6.5]);
		expect(pointOf("sage", 0, 0)).toEqual([8.5, 1.5]);
		expect(pointOf("sun", 0, 0)).toEqual([13.5, 8.5]);
		expect(pointOf("sky", 0, 0)).toEqual([6.5, 13.5]);
		for (const c of COLOURS) {
			const last = pointOf(c, 50, 0);
			const col = pointOf(c, 51, 0);
			expect(Math.abs(last[0] - col[0]) + Math.abs(last[1] - col[1])).toBe(1); // the column starts next to its last ring square
			const end = pointOf(c, 55, 0);
			expect(Math.hypot(end[0] - 7.5, end[1] - 7.5)).toBe(2); // and ends beside the middle
		}
	});
});

describe("setup", () => {
	it("one pick seats you both: the other gets the colour across", () => {
		const s = seat(ludoInit("a"), "sage", "a")!;
		expect(s.seats).toEqual({ sage: "a", sky: "b" });
		expect(ready(s)).toBe(true);
		expect(seat(s, "rose", "b")!.seats).toEqual({ rose: "b", sun: "a" }); // either of you can pick (again)
	});
	it("with four colours, each of you keeps a diagonal pair", () => {
		const s = seat(setColours(ludoInit("a"), 4)!, "sage", "a")!;
		expect(coloursOf(s, "a")).toEqual(["sage", "sky"]);
		expect(coloursOf(s, "b")).toEqual(["rose", "sun"]);
		expect(ready(s)).toBe(true);
	});
	it("changing the number of colours keeps the pick", () => {
		const s = seat(ludoInit("a"), "sun", "b")!;
		expect(setColours(s, 4)!.seats).toEqual({ sun: "b", rose: "b", sage: "a", sky: "a" });
		expect(setColours(setColours(s, 4)!, 2)!.seats).toEqual({ sun: "b", rose: "a" });
		expect(setColours(ludoInit("a"), 4)!.seats).toEqual({});
	});
	it("turns each screen so your colour sits at the bottom left", () => {
		const s = seat(ludoInit("a"), "rose", "a")!; // a: rose (top left), b: sun (bottom right)
		expect(turned(pointOf("rose", -1, 0), viewOf(s, "a"))[0]).toBeLessThan(7.5); // a's yard: left…
		expect(turned(pointOf("rose", -1, 0), viewOf(s, "a"))[1]).toBeGreaterThan(7.5); // …and bottom
		const b = turned(pointOf("sun", -1, 0), viewOf(s, "b"));
		expect(b[0] < 7.5 && b[1] > 7.5).toBe(true);
		expect(viewOf(ludoInit("a"), "a")).toBe(0); // nothing picked yet: as drawn
		const four = seat(setColours(ludoInit("a"), 4)!, "sun", "a")!;
		expect([mainOf(four, "a"), mainOf(four, "b")]).toEqual(["sun", "sky"]);
	});
	it("a game from before picks were kept still turns each screen to its own colour", () => {
		const old = { ...game(), pick: undefined }; // a: rose, b: sun, seated the old way
		expect([mainOf(old, "a"), mainOf(old, "b")]).toEqual(["rose", "sun"]);
		expect(viewOf(old, "a")).not.toBe(viewOf(old, "b"));
	});
	it("starts with every token in its yard and the starter rolling", () => {
		const s = game(false, 2);
		expect(s.pos).toEqual({ rose: [-1, -1], sun: [-1, -1] });
		expect(turnOf(s)).toBe("a");
		expect(turnOf(start(seat(seat(ludoInit("b"), "rose", "a")!, "sun", "b")!)!)).toBe("b");
	});
	it("play again keeps the choices and swaps who rolls first", () => {
		const r = rematch({ ...game(true), phase: "done", winner: "a" });
		expect(r.phase).toBe("setup");
		expect(r.starter).toBe("b");
		expect(ready(r)).toBe(true);
	});
});

describe("rolling and moving", () => {
	it("needs a 6 to leave the yard, and a 6 rolls again", () => {
		let s = roll(game(), 4)!;
		expect(movesOf(s)).toEqual([]); // four tokens in the yard: one move at most, here none
		s = pass(s)!;
		expect(s.turn).toBe("sun");
		s = roll(s, 6)!;
		expect(movesOf(s)).toEqual([{ i: 0, from: -1, to: 0 }]);
		s = move(s, 0)!;
		expect(s.pos.sun).toEqual([0, -1, -1, -1]);
		expect(s.turn).toBe("sun"); // a 6: again
	});
	it("needs the exact roll to get home, and home rolls again", () => {
		let s = roll(at(game(), { rose: [53, -1, -1, -1] }), 4)!;
		expect(movesOf(s)).toEqual([]);
		s = roll(at(game(), { rose: [53, -1, -1, -1] }), 3)!;
		s = move(s, 0)!;
		expect(s.pos.rose![0]).toBe(HOME);
		expect(s.turn).toBe("rose");
	});
	it("a 6 that can't be used still rolls again", () => {
		const s = pass(roll(at(game(), { rose: [52, 56, 56, 56] }), 6)!)!;
		expect(s.turn).toBe("rose");
		expect(s.again).toBe(true);
	});
	it("three 6s in a row lose the turn", () => {
		let s = at(game(), { rose: [10, -1, -1, -1] });
		s = move(roll(s, 6)!, 0)!;
		s = move(roll(s, 6)!, 0)!;
		s = roll(s, 6)!;
		expect(movesOf(s)).toEqual([]);
		expect(pass(s)!.turn).toBe("sun");
	});
	it("an ordinary roll passes the turn; stacked tokens are one move", () => {
		const s = roll(at(game(), { rose: [5, 5, 9, -1] }), 2)!;
		expect(movesOf(s).map((m) => m.from)).toEqual([5, 9]);
		expect(move(s, 1)!.turn).toBe("sun");
		expect(move(s, 3)).toBeNull(); // in the yard: not a move with a 2
	});
});

describe("captures", () => {
	// rose's 3 is ring square 3; sun starts at 26, so sun's 29 is the same square
	it("sends their token home and rolls again", () => {
		const s = move(roll(at(game(), { rose: [1, -1, -1, -1], sun: [29, -1, -1, -1] }), 2)!, 0)!;
		expect(squareOf("rose", 3)).toBe(squareOf("sun", 29));
		expect(s.pos.sun).toEqual([-1, -1, -1, -1]);
		expect(s.last!.hit).toEqual([{ colour: "sun", i: 0, from: 29 }]);
		expect(s.turn).toBe("rose");
	});
	it("never on a flower square", () => {
		// ring square 8 is safe: rose's 8 and sun's 34
		const s = move(roll(at(game(), { rose: [5, -1, -1, -1], sun: [34, -1, -1, -1] }), 3)!, 0)!;
		expect(s.pos.sun![0]).toBe(34);
		expect(s.turn).toBe("sun");
	});
	it("never between your own two colours", () => {
		// four colours: a has rose+sun. rose's 3 = sun's 29 again
		const s = move(roll(at(game(true), { rose: [1, -1, -1, -1], sun: [29, -1, -1, -1] }, "rose"), 2)!, 0)!;
		expect(s.pos.sun![0]).toBe(29);
	});
	it("takes every token of theirs on the square", () => {
		// b has sage+sky; sage starts at 13, sky at 39: rose's 20 is ring 20 = sage's 7 = sky's 33
		const s = move(roll(at(game(true), { rose: [17, -1, -1, -1], sage: [7, 7, -1, -1], sky: [33, -1, -1, -1] }, "rose"), 3)!, 0)!;
		expect(s.pos.sage).toEqual([-1, -1, -1, -1]);
		expect(s.pos.sky![0]).toBe(-1);
		expect(s.last!.hit).toHaveLength(3);
	});
});

describe("turns and the win", () => {
	it("with four colours, turns go round clockwise, so you alternate", () => {
		let s = game(true);
		const who: string[] = [];
		for (let n = 0; n < 4; n++) {
			who.push(`${s.turn}:${turnOf(s)}`);
			s = pass(roll(s, 3)!)!;
		}
		expect(who).toEqual(["rose:a", "sage:b", "sun:a", "sky:b"]);
	});
	it("with four colours you win only once both are home", () => {
		const s = at(game(true, 2), { rose: [HOME, HOME], sun: [HOME, 55] }, "sun");
		const won = move(roll(s, 1)!, 1)!;
		expect(won.phase).toBe("done");
		expect(won.winner).toBe("a");
		const notYet = move(roll(at(game(true, 2), { rose: [HOME, 55], sun: [HOME, 50] }, "rose"), 1)!, 1)!;
		expect(notYet.phase).toBe("play");
	});
	it("with two tokens, two home wins", () => {
		const won = move(roll(at(game(false, 2), { rose: [HOME, 52] }), 4)!, 1)!;
		expect(won.winner).toBe("a");
	});
	it("each move is told apart by the roll it used (a new roll is not a new move)", () => {
		const one = move(roll(game(), 6)!, 0)!;
		const two = move(roll(one, 6)!, 0)!;
		expect([one.last!.n, two.last!.n]).toEqual([1, 2]);
		expect(roll(two, 3)!.last).toEqual(two.last);
	});
	it("only the turn's roll is used, once", () => {
		const s = roll(game(), 6)!;
		expect(roll(s, 3)).toBeNull(); // already rolled
		expect(move(move(s, 0)!, 0)).toBeNull(); // the 6 is spent
	});
});
