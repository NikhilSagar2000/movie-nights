import { DurableObject } from "cloudflare:workers";
import {
	LIMITS,
	PAPERS,
	PEOPLE,
	other,
	type ChatMsg,
	type ClientMsg,
	type Game,
	type GameKind,
	type JarItem,
	type Letter,
	type Peer,
	type Profiles,
	type ServerMsg,
	type Snapshot,
	type Stub,
	type Song,
	type SongHit,
	type SongSearch,
	type Tube,
	type TubeItem,
	type Who,
	type Bests,
} from "../shared/types";
import { YT_ID } from "../shared/tube";
import { bestsOf, recordBest } from "../shared/bests";
import { cleanLook, type Looks } from "../shared/look";
import { cleanGift, eat } from "../shared/gift";
import { dayOf, hitsOf, searchKey, slotFor } from "../shared/song";

type Attachment = { who: Who; sid: string };
type SealStore = { gameId: string; round: number; answers: Partial<Record<Who, string>> };
/** The tuberose's points, plus today's tally per kind so each has a daily cap. */
type GardenStore = { pts: number; day: string; counts: Partial<Record<Growth, number>> };
// [points, times per day]. ponytail: tune after a few weeks of real use.
const GROWTH = { together: [2, 1], stub: [3, 1], game: [1, 3], letter: [1, 2], tube: [1, 3], song: [1, 2] } as const;
type Growth = keyof typeof GROWTH;
/** Searches saved for a week (by searchKey), and today's count against YouTube's free 100 a day (its day, Pacific time). */
type SongCache = Record<string, { at: number; hits: SongHit[] }>;
type SongCount = { day: string; n: number };
const WEEK = 7 * 86_400_000;
const SEARCHES_A_DAY = 95; // of YouTube's 100, a few to spare

const KINDS: GameKind[] = ["mindmeld", "whoami", "taboo", "charades", "emoji", "antakshari", "wave", "ludo"];
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const id = () => crypto.randomUUID().slice(0, 8);
const secs = (v: unknown) => Math.max(0, Math.min(86_400, Number(v) || 0));

/** A video's title and channel, from YouTube's public oEmbed ("" when it can't say). The URL is built from a checked
 *  11-character id, never from user input. */
async function oembed(videoId: string) {
	try {
		const res = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}`, {
			signal: AbortSignal.timeout(4000),
		});
		const j = (await res.json()) as { title?: unknown; author_name?: unknown };
		return { title: str(j.title, LIMITS.title), channel: str(j.author_name, 60) };
	} catch {
		return { title: "", channel: "" };
	}
}

/** Songs for a search, from the YouTube Data API: search.list (its own 100-a-day allowance), then videos.list for the
 *  durations (1 unit of the separate 10,000). */
async function ytSearch(key: string, q: string): Promise<SongSearch> {
	const get = async (path: string, params: Record<string, string>) => {
		const res = await fetch(`https://www.googleapis.com/youtube/v3/${path}?${new URLSearchParams({ ...params, key })}`, { signal: AbortSignal.timeout(6000) });
		const j = (await res.json().catch(() => null)) as { error?: { errors?: { reason?: string }[] } } | null;
		if (!res.ok) throw new Error(j?.error?.errors?.[0]?.reason ?? `status ${res.status}`);
		return j;
	};
	try {
		const found = (await get("search", { part: "snippet", type: "video", videoEmbeddable: "true", regionCode: "IN", maxResults: "15", q })) as {
			items?: { id?: { videoId?: unknown } }[];
		} | null;
		const ids = (found?.items ?? []).map((it) => it?.id?.videoId).filter((v): v is string => typeof v === "string" && YT_ID.test(v));
		if (!ids.length) return { hits: [] };
		const videos = await get("videos", { part: "contentDetails", id: ids.join(",") });
		return { hits: hitsOf(found, videos).slice(0, 12) };
	} catch (e) {
		const reason = (e as Error).message;
		console.warn("song search failed:", reason); // the reason only; the URL carries the key
		return { error: reason === "quotaExceeded" || reason === "dailyLimitExceeded" ? "resting" : "failed" };
	}
}

/**
 * One Room per couple. It is the WebSocket hub and the database.
 * Everything that must survive hibernation lives in storage or in socket attachments, never in fields.
 * ponytail: whole arrays are rewritten on each change; move to SQL tables if the lists ever get big.
 */
export class Room extends DurableObject<Env> {
	// ponytail: memory only, so it resets if the Room sleeps (>10s idle); pair with long passphrases.
	private loginFails = new Map<string, number[]>();

	/** Login throttle, called by the Worker over RPC: at most 5 wrong passcodes per IP per 10 minutes. */
	allowLogin(ip: string) {
		const now = Date.now();
		const recent = (this.loginFails.get(ip) ?? []).filter((t) => now - t < 600_000);
		this.loginFails.set(ip, recent);
		return recent.length < 5;
	}

	failedLogin(ip: string) {
		this.loginFails.set(ip, [...(this.loginFails.get(ip) ?? []), Date.now()]);
		if (this.loginFails.size > 1000) this.loginFails.clear(); // don't let a flood of IPs grow memory
	}

	/** "A song a day" search, called by the Worker over RPC (only after the login check). */
	async songSearch(q: string): Promise<SongSearch> {
		const k = searchKey(q);
		if (!k) return { hits: [] };
		const s = this.ctx.storage;
		const saved = (await s.get<SongCache>("songcache"))?.[k];
		if (saved && Date.now() - saved.at < WEEK) return { hits: saved.hits };
		const key = (this.env as Env & { YOUTUBE_API_KEY?: string }).YOUTUBE_API_KEY; // a secret you set yourself; none = search is off
		if (!key) return { error: "off" };
		const day = dayOf(Date.now(), "America/Los_Angeles");
		const count = await s.get<SongCount>("songsearch");
		const n = count?.day === day ? count.n : 0;
		if (n >= SEARCHES_A_DAY) return { error: "resting" };
		await s.put("songsearch", { day, n: n + 1 } satisfies SongCount); // counted before asking, so two at once can't both slip past
		const res = await ytSearch(key, k);
		if ("error" in res) {
			if (res.error === "resting") await s.put("songsearch", { day, n: SEARCHES_A_DAY } satisfies SongCount);
			return res;
		}
		// read again: other searches may have saved theirs while this one was out
		const cache = { ...(await s.get<SongCache>("songcache")), [k]: { at: Date.now(), hits: res.hits } };
		const keep = Object.entries(cache)
			.filter(([, v]) => Date.now() - v.at < WEEK)
			.sort((a, b) => b[1].at - a[1].at)
			.slice(0, 150);
		await s.put("songcache", Object.fromEntries(keep));
		return res;
	}

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		// Answered by the runtime without waking the object.
		ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
	}

	async fetch(req: Request): Promise<Response> {
		const who = req.headers.get("X-Who") as Who;
		const sid = str(new URL(req.url).searchParams.get("sid"), 64);
		if (!PEOPLE.includes(who) || !sid) return new Response("bad request", { status: 400 });

		// One live socket per person: a new tab or reconnect replaces the old one.
		for (const old of this.ctx.getWebSockets(who)) {
			try {
				old.close(4000, "replaced");
			} catch {}
		}

		const { 0: client, 1: server } = new WebSocketPair();
		this.ctx.acceptWebSocket(server, [who]);
		server.serializeAttachment({ who, sid } satisfies Attachment);
		server.send(JSON.stringify({ t: "init", ...(await this.snapshot(who)) } satisfies ServerMsg));
		this.broadcast({ t: "presence", online: this.online() });
		await this.grow("together");
		return new Response(null, { status: 101, webSocket: client });
	}

	async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
		if (typeof raw !== "string" || raw.length > LIMITS.relayBytes) return;
		const { who } = ws.deserializeAttachment() as Attachment;
		let m: ClientMsg;
		try {
			m = JSON.parse(raw);
		} catch {
			return;
		}
		const s = this.ctx.storage;

		switch (m?.t) {
			case "relay":
				if (m.data && typeof m.data === "object") this.broadcast({ t: "relay", from: who, data: m.data }, who);
				return;

			case "profile": {
				// You name your partner, not yourself: the profile you send belongs to them.
				const name = str(m.profile?.name, LIMITS.name);
				const color = /^#[0-9a-f]{6}$/i.test(m.profile?.color ?? "") ? m.profile.color : "#fb6f92";
				if (!name) return;
				const profiles = { ...((await s.get<Profiles>("profiles")) ?? {}), [other(who)]: { name, color } };
				await s.put("profiles", profiles);
				return this.broadcast({ t: "profiles", profiles });
			}

			case "chat": {
				const text = str(m.text, LIMITS.chat);
				const sticker = str(m.sticker, 32);
				if (!text && !sticker) return;
				const msg: ChatMsg = { id: id(), from: who, at: Date.now(), ...(text ? { text } : { sticker }) };
				const chat = [...((await s.get<ChatMsg[]>("chat")) ?? []), msg].slice(-LIMITS.chatKeep);
				await s.put("chat", chat);
				return this.broadcast({ t: "chat", msg });
			}

			case "jar:add": {
				const title = str(m.title, LIMITS.title);
				if (!title) return;
				const jar = [...((await s.get<JarItem[]>("jar")) ?? []), { id: id(), title, addedBy: who }];
				await s.put("jar", jar);
				return this.broadcast({ t: "jar", jar });
			}
			case "jar:remove": {
				const jar = ((await s.get<JarItem[]>("jar")) ?? []).filter((j) => j.id !== m.id);
				await s.put("jar", jar);
				return this.broadcast({ t: "jar", jar });
			}
			case "jar:shake": {
				// Picked here so both people see the same movie.
				const jar = (await s.get<JarItem[]>("jar")) ?? [];
				if (!jar.length) return;
				const item = jar[crypto.getRandomValues(new Uint32Array(1))[0] % jar.length];
				return this.broadcast({ t: "jar:picked", item, by: who });
			}

			case "stub:new": {
				const title = str(m.title, LIMITS.title);
				if (!title) return;
				const stub: Stub = { id: id(), title, date: new Date().toISOString().slice(0, 10), hearts: {}, notes: {} };
				const stubs = [stub, ...((await s.get<Stub[]>("stubs")) ?? [])];
				await s.put("stubs", stubs);
				this.broadcast({ t: "stubs", stubs });
				return this.grow("stub");
			}
			case "stub:rate": {
				const hearts = Math.min(5, Math.max(1, Math.round(Number(m.hearts) || 0)));
				const note = str(m.note, LIMITS.note);
				const stubs = ((await s.get<Stub[]>("stubs")) ?? []).map((st) =>
					st.id === m.id ? { ...st, hearts: { ...st.hearts, [who]: hearts }, notes: { ...st.notes, [who]: note } } : st,
				);
				await s.put("stubs", stubs);
				return this.broadcast({ t: "stubs", stubs });
			}
			case "stub:delete": {
				const stubs = ((await s.get<Stub[]>("stubs")) ?? []).filter((st) => st.id !== m.id);
				await s.put("stubs", stubs);
				return this.broadcast({ t: "stubs", stubs });
			}

			case "letter:send": {
				const text = str(m.text, LIMITS.letter);
				const gift = cleanGift(m.gift);
				if (!text && !gift) return; // a blank note needs flowers or chocolates with it
				const paper = PAPERS.includes(m.paper) ? m.paper : "cream";
				const letter: Letter = { id: id(), from: who, text, paper, at: Date.now(), ...(gift && { gift }) };
				const letters = [...((await s.get<Letter[]>("letters")) ?? []), letter].slice(-LIMITS.lettersKeep);
				await s.put("letters", letters);
				this.broadcast({ t: "letters", letters });
				return this.grow("letter");
			}
			case "letter:open": {
				// only the person it was written to can open it, once
				const letters = (await s.get<Letter[]>("letters")) ?? [];
				const letter = letters.find((l) => l.id === m.id);
				if (!letter || letter.from === who || letter.openedAt) return;
				letter.openedAt = Date.now();
				await s.put("letters", letters);
				return this.broadcast({ t: "letters", letters });
			}
			case "letter:eat": {
				// only the person it was sent to eats the chocolates, each one once
				const letters = (await s.get<Letter[]>("letters")) ?? [];
				const letter = letters.find((l) => l.id === m.id);
				const gift = letter && letter.from !== who ? eat(letter.gift, m.i) : null;
				if (!letter || !gift) return;
				letter.gift = gift;
				await s.put("letters", letters);
				return this.broadcast({ t: "letters", letters });
			}

			// ---- a song a day: one each, swappable until the other person has played it ----
			case "song:send": {
				if (typeof m.vid !== "string" || !YT_ID.test(m.vid)) return;
				const note = str(m.note, LIMITS.songNote);
				// look it up first: nothing waits on the network between reading the songs and writing them back
				const { title, channel } = await oembed(m.vid);
				const songs = (await s.get<Song[]>("songs")) ?? [];
				const day = dayOf(Date.now());
				const slot = slotFor(songs, who, day);
				if (slot === "locked") return;
				const song: Song = { id: id(), vid: m.vid, title: title || "A song", channel, from: who, day, note, at: Date.now() };
				const next = (slot === "new" ? [...songs, song] : songs.map((x) => (x === slot.replace ? song : x))).slice(-LIMITS.songsKeep);
				await s.put("songs", next);
				this.broadcast({ t: "songs", songs: next });
				if (slot === "new") await this.grow("song");
				return;
			}
			case "song:played": {
				// only the person it was dedicated to, once
				const songs = (await s.get<Song[]>("songs")) ?? [];
				const song = songs.find((x) => x.id === m.id);
				if (!song || song.from === who || song.playedAt) return;
				song.playedAt = Date.now();
				await s.put("songs", songs);
				return this.broadcast({ t: "songs", songs });
			}

			// ---- listen together: the Room keeps the clock (`at`), so both players can work out where the video is ----
			case "tube:load":
			case "tube:queue": {
				if (typeof m.id !== "string" || !YT_ID.test(m.id)) return;
				const item: TubeItem = { key: id(), id: m.id, title: (await oembed(m.id)).title || "A YouTube video", by: who };
				const tube = await s.get<Tube>("tube");
				const next: Tube =
					m.t === "tube:queue" && tube
						? { ...tube, queue: [...tube.queue, item].slice(0, LIMITS.tubeQueue) }
						: { ...item, playing: true, pos: 0, at: Date.now(), queue: tube?.queue ?? [] };
				await s.put("tube", next);
				this.broadcast({ t: "tube", tube: next });
				if (m.t === "tube:load") await this.grow("tube");
				return;
			}
			case "tube:unqueue": {
				const tube = await s.get<Tube>("tube");
				if (!tube) return;
				const next = { ...tube, queue: tube.queue.filter((q) => q.key !== m.key) };
				await s.put("tube", next);
				return this.broadcast({ t: "tube", tube: next });
			}
			case "tube:play":
			case "tube:pause":
			case "tube:seek": {
				const tube = await s.get<Tube>("tube");
				if (!tube) return;
				const playing = m.t === "tube:play" ? true : m.t === "tube:pause" ? false : tube.playing;
				const next = { ...tube, playing, pos: secs(m.pos), at: Date.now() };
				await s.put("tube", next);
				return this.broadcast({ t: "tube", tube: next });
			}
			case "tube:ended":
			case "tube:skip": {
				const tube = await s.get<Tube>("tube");
				if (!tube || (m.t === "tube:ended" && m.key !== tube.key)) return; // both players report the end: advance once
				const [head, ...rest] = tube.queue;
				const next: Tube | null = head ? { ...head, playing: true, pos: 0, at: Date.now(), queue: rest } : null;
				if (next) await s.put("tube", next);
				else await s.delete("tube");
				return this.broadcast({ t: "tube", tube: next });
			}
			case "tube:stop":
				await s.delete("tube");
				return this.broadcast({ t: "tube", tube: null });

			case "game:new": {
				if (!KINDS.includes(m.kind)) return;
				const game: Game = { id: id(), kind: m.kind, state: m.state ?? null, reveals: [], rev: 0 };
				await s.put("game", game);
				await s.delete("sealed");
				this.broadcast({ t: "sealed", sealed: null });
				this.broadcast({ t: "game", game });
				return this.grow("game");
			}
			case "game:state": {
				const game = await s.get<Game>("game");
				if (!game || game.id !== m.id) return; // stale move from a finished game
				if (m.rev !== (game.rev ?? 0)) return; // built on an older state: a newer write already landed
				const next = { ...game, state: m.state ?? null, rev: (game.rev ?? 0) + 1 };
				await s.put("game", next);
				return this.broadcast({ t: "game", game: next });
			}
			case "game:end":
				await s.delete(["game", "sealed"]);
				return this.broadcast({ t: "game", game: null });

			case "best": {
				const next = recordBest(bestsOf(await s.get<Bests>("bests")), who, String(m.key ?? ""), m.score);
				if (!next) return;
				await s.put("bests", next);
				return this.broadcast({ t: "bests", bests: next });
			}
			case "best:seen": {
				const bests = bestsOf(await s.get<Bests>("bests"));
				if (!bests.notes[who].length) return;
				bests.notes[who] = [];
				await s.put("bests", bests);
				return this.broadcast({ t: "bests", bests });
			}
			case "look": {
				// Your own look only (unlike "profile", which names your partner).
				const look = cleanLook(m.look, who);
				if (!look) return;
				const looks: Looks = { ...((await s.get<Looks>("looks")) ?? {}), [who]: look };
				await s.put("looks", looks);
				return this.broadcast({ t: "looks", looks });
			}
			case "seal": {
				const answer = str(m.answer, LIMITS.answer);
				const game = await s.get<Game>("game");
				if (!answer || !game || game.id !== m.gameId || m.round !== game.reveals.length) return;
				let seal = await s.get<SealStore>("sealed");
				if (!seal || seal.gameId !== game.id || seal.round !== m.round) seal = { gameId: game.id, round: m.round, answers: {} };
				seal.answers[who] = answer;

				if (PEOPLE.every((p) => seal.answers[p])) {
					const next = { ...game, reveals: [...game.reveals, seal.answers as Record<Who, string>] };
					await s.put("game", next);
					await s.delete("sealed");
					this.broadcast({ t: "sealed", sealed: null });
					return this.broadcast({ t: "game", game: next });
				}
				await s.put("sealed", seal);
				return this.broadcast({ t: "sealed", sealed: { round: seal.round, submitted: Object.keys(seal.answers) as Who[] } });
			}
		}
	}

	async webSocketClose(ws: WebSocket, code: number, reason: string) {
		try {
			ws.close(code, reason);
		} catch {}
		this.broadcast({ t: "presence", online: this.online() });
	}

	async webSocketError() {
		this.broadcast({ t: "presence", online: this.online() });
	}

	private async snapshot(you: Who): Promise<Snapshot> {
		const got = await this.ctx.storage.get(["profiles", "chat", "jar", "stubs", "letters", "songs", "tube", "garden", "game", "sealed", "bests", "looks"]);
		const seal = got.get("sealed") as SealStore | undefined;
		let game = (got.get("game") as Game | undefined) ?? null;
		if (game && !KINDS.includes(game.kind)) {
			// a game this version no longer has (e.g. Connect Four): drop it so nobody lands on a dead screen
			await this.ctx.storage.delete(["game", "sealed"]);
			game = null;
		}
		return {
			you,
			now: Date.now(),
			online: this.online(),
			profiles: (got.get("profiles") as Profiles) ?? {},
			chat: (got.get("chat") as ChatMsg[]) ?? [],
			jar: (got.get("jar") as JarItem[]) ?? [],
			stubs: (got.get("stubs") as Stub[]) ?? [],
			letters: (got.get("letters") as Letter[]) ?? [],
			songs: (got.get("songs") as Song[]) ?? [],
			tube: (got.get("tube") as Tube) ?? null,
			garden: { pts: (got.get("garden") as GardenStore | undefined)?.pts ?? 0 },
			game,
			sealed: game && seal ? { round: seal.round, submitted: Object.keys(seal.answers) as Who[] } : null,
			bests: bestsOf(got.get("bests") as Bests | undefined),
			looks: (got.get("looks") as Looks) ?? {},
		};
	}

	/** The tuberose grows a little, but only while you're both here, and each kind only so often a day. */
	private async grow(kind: Growth) {
		if (new Set(this.online().map((p) => p.who)).size < 2) return;
		const s = this.ctx.storage;
		const day = dayOf(Date.now());
		let g = (await s.get<GardenStore>("garden")) ?? { pts: 0, day, counts: {} };
		if (g.day !== day) g = { ...g, day, counts: {} };
		const [pts, max] = GROWTH[kind];
		if ((g.counts[kind] ?? 0) >= max) return;
		g = { ...g, pts: g.pts + pts, counts: { ...g.counts, [kind]: (g.counts[kind] ?? 0) + 1 } };
		await s.put("garden", g);
		this.broadcast({ t: "garden", garden: { pts: g.pts } });
	}

	private online(): Peer[] {
		return this.ctx
			.getWebSockets()
			.filter((ws) => ws.readyState === WebSocket.OPEN)
			.map((ws) => ws.deserializeAttachment() as Attachment)
			.map(({ who, sid }) => ({ who, sid }));
	}

	private broadcast(msg: ServerMsg, except?: Who) {
		const data = JSON.stringify(msg);
		for (const ws of this.ctx.getWebSockets()) {
			if (except && (ws.deserializeAttachment() as Attachment).who === except) continue;
			try {
				ws.send(data);
			} catch {}
		}
	}
}
