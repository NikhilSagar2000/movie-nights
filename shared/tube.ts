// Listen together: the YouTube bits both sides share (pure, tested in tube.test.ts).

export const YT_ID = /^[\w-]{11}$/;

/** The 11-character video id from any usual YouTube link (watch, youtu.be, shorts, embed, live, music), or null. */
export function parseYouTube(input: string): string | null {
	const s = input.trim();
	if (YT_ID.test(s)) return s;
	let u: URL;
	try {
		u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
	} catch {
		return null;
	}
	const host = u.hostname.replace(/^(www|m|music)\./, "");
	let id: string | null = null;
	if (host === "youtu.be") id = u.pathname.split("/")[1] ?? null;
	else if (host === "youtube.com" || host === "youtube-nocookie.com") {
		id = u.searchParams.get("v");
		const m = u.pathname.match(/^\/(?:shorts|embed|live|v)\/([\w-]{11})/);
		if (!id && m) id = m[1];
	}
	return id && YT_ID.test(id) ? id : null;
}

/** Where the video should be right now: the last known position, plus the time since then while it plays. */
export const tubeAt = (t: { pos: number; at: number; playing: boolean }, now: number) => t.pos + (t.playing ? Math.max(0, now - t.at) / 1000 : 0);
