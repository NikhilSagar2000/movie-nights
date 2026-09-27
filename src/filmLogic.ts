// Pure helpers for "Play a movie file" (src/filmPlayer.ts): subtitle files, episode order, the call's route, times.

const SUB = /\.(srt|vtt)$/i;
const VIDEO = /\.(mp4|m4v|mkv|webm|mov|ogv)$/i;

type Named = { name: string; type?: string };

/** "Show.S01E02.1080p.mkv" → "Show S01E02 1080p" */
export const titleOf = (name: string) =>
	name
		.replace(/\.[^.]+$/, "")
		.replace(/[._]+/g, " ")
		.trim();

/** An .srt (or .vtt) as WebVTT, which a <track> can read: SRT only differs in the comma before the milliseconds. */
export function srtToVtt(text: string): string {
	const body = text
		.replace(/^﻿/, "")
		.replace(/\r\n?/g, "\n")
		.replace(/\{\\[^}]*\}/g, "") // {\an8}-style positioning tags some .srt files carry
		.trim();
	if (body.startsWith("WEBVTT")) return body;
	// VTT wants two-digit hours; some .srt files write "0:01:02,500"
	const times = body.replace(/(\d+):(\d\d):(\d\d)[,.](\d{3})/g, (_, h: string, m, s, ms) => `${h.padStart(2, "0")}:${m}:${s}.${ms}`);
	return `WEBVTT\n\n${times}`;
}

/** Subtitle files come as UTF-8, or (older ones) Windows-1252: é and ñ come out right either way. */
export function decodeSubs(buf: ArrayBuffer | Uint8Array): string {
	try {
		return new TextDecoder("utf-8", { fatal: true }).decode(buf);
	} catch {
		return new TextDecoder("windows-1252").decode(buf);
	}
}

const base = (n: string) => n.replace(/\.[^.]+$/, "").toLowerCase();
/** "S01E02", "s1e2", "1x02" → "1x2" */
function episode(n: string) {
	const m = n.match(/s(\d{1,2})[ ._-]?e(\d{1,3})/i) ?? n.match(/\b(\d{1,2})x(\d{2,3})\b/i);
	return m ? `${+m[1]}x${+m[2]}` : null;
}
function fits(video: string, sub: string) {
	const a = episode(video),
		b = episode(sub);
	if (a && b) return a === b;
	const v = base(video),
		s = base(sub);
	return v.startsWith(s) || s.startsWith(v); // "Movie.2019.srt" ↔ "Movie.2019.1080p.mkv", and the other way round
}

/** The picked files as a playlist: videos in name order (E2 before E10), each with its subtitle file if one fits. */
export function order<T extends Named>(files: T[]): { video: T; sub: T | null }[] {
	const videos = files
		.filter((f) => !SUB.test(f.name) && (VIDEO.test(f.name) || !!f.type?.startsWith("video/")))
		.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
	const subs = files.filter((f) => SUB.test(f.name));
	const lone = videos.length === 1 && subs.length === 1;
	return videos.map((video) => ({ video, sub: lone ? subs[0] : (subs.find((s) => fits(video.name, s.name)) ?? null) }));
}

type Stat = {
	id: string;
	type: string;
	selectedCandidatePairId?: string;
	selected?: boolean;
	nominated?: boolean;
	state?: string;
	localCandidateId?: string;
	remoteCandidateId?: string;
	candidateType?: string;
};
/** Whether the call runs straight between the two browsers or through the TURN relay (null: not connected yet). */
export function routeOf(reports: Iterable<Stat>): "direct" | "relay" | null {
	const all = [...reports];
	const byId = new Map(all.map((r) => [r.id, r]));
	const chosen = all.find((r) => r.type === "transport" && r.selectedCandidatePairId)?.selectedCandidatePairId;
	const pair = chosen
		? byId.get(chosen)
		: all.find((r) => r.type === "candidate-pair" && (r.selected || (r.nominated && r.state === "succeeded")));
	if (!pair) return null;
	const ends = [byId.get(pair.localCandidateId ?? ""), byId.get(pair.remoteCandidateId ?? "")];
	return ends.some((c) => c?.candidateType === "relay") ? "relay" : "direct";
}

/** 723 → "12:03", 6730 → "1:52:10" */
export function clock(sec: number) {
	const t = Math.max(0, Math.floor(Number.isFinite(sec) ? sec : 0));
	const h = Math.floor(t / 3600),
		m = Math.floor((t % 3600) / 60),
		s = String(t % 60).padStart(2, "0");
	return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}
