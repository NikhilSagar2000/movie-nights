// Send a pic: the fridge's rules both sides share (pure, tested in pic.test.ts). Same rules as a song a day.
import { PEOPLE, type Pic, type Who } from "./types";

/** Where `who`'s photo for `day` goes: a new one, over today's (not opened yet), or nowhere (they've opened it). */
export function picSlot(pics: Pic[], who: Who, day: string): "new" | "locked" | { replace: Pic } {
	const today = pics.find((p) => p.from === who && p.day === day);
	return !today ? "new" : today.seenAt ? "locked" : { replace: today };
}

/** The photo from `who` on the fridge: today's, or else their newest one still waiting to be opened. */
export const picFrom = (pics: Pic[], who: Who, day: string) => pics.findLast((p) => p.from === who && (p.day === day || !p.seenAt));

/** What stays: only what's on the fridge (one each at most). The rest come down, and their pictures are deleted. */
export const keptPics = (pics: Pic[], day: string) => pics.filter((p) => PEOPLE.some((w) => picFrom(pics, w, day) === p));
