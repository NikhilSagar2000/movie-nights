import type { Who } from "../../shared/types";

/* What the main bundle needs to open a Ludo game: the state's shape, a fresh game, whose turn it is and the status
   line. The rules are in ludoLogic.ts, which loads with the board. */

export const COLOURS = ["rose", "sage", "sun", "sky"] as const;
export type Colour = (typeof COLOURS)[number];

/** The latest move (both screens animate it). `n`: the roll it used, which tells one move from the next. */
export type Last = { colour: Colour; i: number; from: number; to: number; hit: { colour: Colour; i: number; from: number }[]; n: number };
export type Ludo = {
	phase: "setup" | "play" | "done";
	/** Rolls first (Play again swaps it). */
	starter: Who;
	colours: 2 | 4;
	tokens: 2 | 4;
	seats: Partial<Record<Colour, Who>>;
	/** The colour that was picked (its owner picked it; the rest of the seats follow from it). */
	pick?: Colour;
	pos: Partial<Record<Colour, number[]>>;
	turn: Colour;
	/** A roll waiting to be used (null: roll next). */
	roll: number | null;
	/** The face the die shows (0 before the first roll). */
	die: number;
	/** 6s in a row this turn (the third loses it). */
	sixes: number;
	/** Counts rolls, so the same number rolled twice still tumbles. */
	rolls: number;
	/** The turn's player rolls again (after a 6, a capture or getting home). */
	again?: boolean;
	last?: Last;
	winner?: Who;
};

export const ludoInit = (starter: Who): Ludo => ({ phase: "setup", starter, colours: 2, tokens: 4, seats: {}, pos: {}, turn: "rose", roll: null, die: 0, sixes: 0, rolls: 0 });
export const turnOf = (s: Ludo): Who | null => (s.phase === "play" ? (s.seats[s.turn] ?? null) : null);

export const ludoStatus = (s: Ludo, you: Who, name: (w: Who) => string) => {
	if (s.phase === "setup") return "Pick your colours";
	const w = s.phase === "done" ? s.winner! : turnOf(s)!;
	if (s.phase === "done") return w === you ? "You won!" : `${name(w)} won`;
	return w === you ? "Your turn" : `${name(w)}'s turn`;
};
