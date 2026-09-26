import { DurableObject } from "cloudflare:workers";
import {
	LIMITS,
	PEOPLE,
	other,
	type ChatMsg,
	type ClientMsg,
	type Game,
	type GameKind,
	type JarItem,
	type Peer,
	type Profiles,
	type ServerMsg,
	type Snapshot,
	type Stub,
	type Who,
} from "../shared/types";

type Attachment = { who: Who; sid: string };
type SealStore = { gameId: string; round: number; answers: Partial<Record<Who, string>> };

const KINDS: GameKind[] = ["ttt", "c4", "memory", "rps", "mindmeld", "doodle"];
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const id = () => crypto.randomUUID().slice(0, 8);

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
				return this.broadcast({ t: "stubs", stubs });
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

			case "game:new": {
				if (!KINDS.includes(m.kind)) return;
				const game: Game = { id: id(), kind: m.kind, state: m.state ?? null, reveals: [] };
				await s.put("game", game);
				await s.delete("sealed");
				this.broadcast({ t: "sealed", sealed: null });
				return this.broadcast({ t: "game", game });
			}
			case "game:state": {
				const game = await s.get<Game>("game");
				if (!game || game.id !== m.id) return; // stale move from a finished game
				const next = { ...game, state: m.state ?? null };
				await s.put("game", next);
				return this.broadcast({ t: "game", game: next });
			}
			case "game:end":
				await s.delete(["game", "sealed"]);
				return this.broadcast({ t: "game", game: null });

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
		const got = await this.ctx.storage.get(["profiles", "chat", "jar", "stubs", "game", "sealed"]);
		const seal = got.get("sealed") as SealStore | undefined;
		return {
			you,
			online: this.online(),
			profiles: (got.get("profiles") as Profiles) ?? {},
			chat: (got.get("chat") as ChatMsg[]) ?? [],
			jar: (got.get("jar") as JarItem[]) ?? [],
			stubs: (got.get("stubs") as Stub[]) ?? [],
			game: (got.get("game") as Game) ?? null,
			sealed: seal ? { round: seal.round, submitted: Object.keys(seal.answers) as Who[] } : null,
		};
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
