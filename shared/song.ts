// A song a day: the rules both sides share (pure, tested in song.test.ts).
import { LIMITS, type Song, type SongHit, type Who } from "./types";
import { YT_ID } from "./tube";

/** A date as "YYYY-MM-DD". Songs and the garden run on India's day; YouTube's free searches reset on Pacific time. */
export const dayOf = (ms: number, timeZone = "Asia/Kolkata") => new Date(ms).toLocaleDateString("en-CA", { timeZone });

/** What gets searched (and saved) for what was typed, or "" for "don't search yet": fewer than 4 letters. */
export function searchKey(q: unknown) {
	const k = (typeof q === "string" ? q : "").trim().toLowerCase().replace(/\s+/g, " ").slice(0, 80);
	return k.replace(/ /g, "").length >= 4 ? k : "";
}

/** "PT4M28S" → 268. Anything else → 0. */
export function secsOf(d: unknown) {
	const m = typeof d === "string" ? d.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/) : null;
	if (!m) return 0;
	const [, days, h, min, s] = m.map((x) => Number(x) || 0);
	return ((days * 24 + h) * 60 + min) * 60 + s;
}

const NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
/** YouTube's search titles arrive HTML-escaped ("Tum Hi Ho &amp; more"). */
export const unescape = (s: string) =>
	s.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (all, e: string) => {
		if (e[0] !== "#") return NAMED[e.toLowerCase()] ?? all;
		const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
		return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : all;
	});

const SHORTEST = 60; // shorter is a Short or a fan clip, not a song
const LONGEST = 15 * 60; // longer is a jukebox mix or a whole album
const text = (v: unknown, max: number) => (typeof v === "string" ? unescape(v).trim().slice(0, max) : "");

/** Search results from YouTube's search.list + videos.list answers, in search order: real ids, and song-length videos only. */
export function hitsOf(search: unknown, videos: unknown): SongHit[] {
	const items = (v: unknown) => (Array.isArray((v as { items?: unknown })?.items) ? ((v as { items: unknown[] }).items as Record<string, any>[]) : []);
	const secs = new Map(items(videos).map((v) => [v?.id, secsOf(v?.contentDetails?.duration)]));
	const hits: SongHit[] = [];
	for (const it of items(search)) {
		const vid = it?.id?.videoId;
		const s = secs.get(vid) ?? 0;
		if (typeof vid !== "string" || !YT_ID.test(vid) || s < SHORTEST || s > LONGEST || hits.some((h) => h.vid === vid)) continue;
		hits.push({ vid, title: text(it.snippet?.title, LIMITS.title) || "A song", channel: text(it.snippet?.channelTitle, 60), secs: s });
	}
	return hits;
}

/** Where `who`'s song for `day` goes: a new one, over today's (not played yet), or nowhere (they've played it). */
export function slotFor(songs: Song[], who: Who, day: string): "new" | "locked" | { replace: Song } {
	const today = songs.find((s) => s.from === who && s.day === day);
	return !today ? "new" : today.playedAt ? "locked" : { replace: today };
}

/** The song from `who` worth showing: today's, or else their newest one still waiting to be played. */
export const songFrom = (songs: Song[], who: Who, day: string) => songs.findLast((s) => s.from === who && (s.day === day || !s.playedAt));

/** 268 → "4:28". */
export const clock = (secs: number) => {
	const s = Math.max(0, Math.floor(secs));
	return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** YouTube's still for a video (a picture, not the player: fine to show anywhere, any size). */
export const thumbOf = (vid: string) => `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`;
