/* Pure game logic: no React, no network. The views and the Room only move data around. */

// ---- Word matching (Mind Meld, and every game that checks a typed guess) ----
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

// ---- Emoji Movie ----
const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const isEmoji = (g: string) => /\p{Extended_Pictographic}|\p{Regional_Indicator}|⃣/u.test(g);
/** Keeps only emoji (and single spaces between them), at most `max` of them, so a clue can't spell out the answer. */
export function emojiOnly(s: string, max = 40) {
	const out: string[] = [];
	let n = 0;
	for (const { segment } of graphemes.segment(s)) {
		if (isEmoji(segment)) {
			if (n++ >= max) break;
			out.push(segment);
		} else if (/\s/.test(segment) && out.length && out.at(-1) !== " ") out.push(" ");
	}
	return out.join("");
}

// ---- Same Wave ----
/** How close a guess on the 0–100 dial landed. */
export function waveZone(dial: number, target: number) {
	const d = Math.abs(dial - target);
	return d <= 4 ? "bullseye" : d <= 10 ? "close" : d <= 18 ? "near" : "far";
}
