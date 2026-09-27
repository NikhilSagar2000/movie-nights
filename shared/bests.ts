import { other, SOLO_GAMES, SOLO_LOW, SOLO_MODES, type Bests, type SoloGame, type Who } from "./types";

/* Best scores for the solo games: pure rules shared by the Room (which enforces them) and the page. */

export const NO_BESTS: Bests = { scores: { a: {}, b: {} }, notes: { a: [], b: [] } };
/** Fill in anything missing from a stored value (older rooms have none). */
export const bestsOf = (v: Partial<Bests> | undefined): Bests => ({
	scores: { a: { ...v?.scores?.a }, b: { ...v?.scores?.b } },
	notes: { a: [...(v?.notes?.a ?? [])], b: [...(v?.notes?.b ?? [])] },
});

/** The game in a key ("mines:s" → "mines"), or null if it isn't a real solo game key (so the stored keys stay a short, fixed list). */
export function gameOf(key: string): SoloGame | null {
	const [game, mode, extra] = key.split(":");
	if (extra !== undefined || !(SOLO_GAMES as readonly string[]).includes(game)) return null;
	const modes = SOLO_MODES[game as SoloGame];
	return (modes ? mode !== undefined && modes.includes(mode) : mode === undefined) ? (game as SoloGame) : null;
}
/** Is `a` a better score than `b` (none yet counts as beaten)? Times: lower is better. */
export const better = (game: SoloGame, a: number, b: number | undefined) => b === undefined || (SOLO_LOW.includes(game) ? a < b : a > b);

/** Record a best, or null if it isn't one (or isn't valid). Overtaking the other person leaves them a note. */
export function recordBest(b: Bests, who: Who, key: string, raw: unknown, now = Date.now()): Bests | null {
	const game = gameOf(key);
	if (!game || typeof raw !== "number" || !Number.isFinite(raw) || raw < 0 || raw > 1e7) return null;
	const score = Math.round(raw); // whole points and seconds
	const low = SOLO_LOW.includes(game);
	if (!low && score === 0) return null; // 0 points isn't a best (0 seconds is)
	const mine = b.scores[who][key];
	if (!better(game, score, mine)) return null;
	const them = other(who);
	const theirs = b.scores[them][key];
	const next = bestsOf(b);
	next.scores[who][key] = score;
	// the moment you pass them (not every time you improve on a lead you already had)
	if (theirs !== undefined && better(game, score, theirs) && (mine === undefined || !better(game, mine, theirs)))
		next.notes[them] = [...next.notes[them].filter((n) => n.key !== key), { key, by: who, score, yours: theirs, at: now }].slice(-10);
	return next;
}
