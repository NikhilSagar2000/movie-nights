import { CARDS } from "../../games/decks/cards";
import { MOVIES } from "../../games/decks/movies";
import { PEOPLE } from "../../games/decks/people";

/* Jumble: the words and the scrambler. Pure. The words are the single-word entries of the existing decks. */

export type Word = { w: string; hint: string };

const fits = (s: string) => /^[A-Za-z]{4,9}$/.test(s);
const seen = new Set<string>();
/** Single-word, letters-only, 4–9 letters. A word in two decks (Sholay, Titanic) keeps its first, more telling hint. */
export const WORDS: Word[] = [
	...CARDS.filter((c) => fits(c.w)).map((c) => ({ w: c.w, hint: c.ban[0] })),
	...MOVIES.filter((m) => fits(m.t)).map((m) => ({ w: m.t, hint: "Movie" })),
	...PEOPLE.filter((p) => fits(p.n)).map((p) => ({ w: p.n, hint: p.h })),
].filter((x) => !seen.has(x.w.toLowerCase()) && !!seen.add(x.w.toLowerCase()));

/** The same letters in a new order, never the word itself (a shuffle that lands back on it is rotated by one,
 *  which always differs unless every letter is the same). */
export function scramble(word: string, rnd = Math.random): string {
	const a = [...word];
	for (let i = a.length - 1; i > 0; i--) {
		const j = Math.floor(rnd() * (i + 1));
		[a[i], a[j]] = [a[j], a[i]];
	}
	const s = a.join("");
	return s === word ? s.slice(1) + s[0] : s;
}
