import { LIMITS } from "../shared/types";
import { matchPasscode, readCookie, sessionCookie, signToken, verifyToken } from "./auth";

export { Room } from "./room";

const STUN = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }];

export default {
	async fetch(req, env): Promise<Response> {
		const url = new URL(req.url);
		// Half-configured means closed: without SESSION_SECRET, a cookie signed with an empty key would verify.
		if (!env.USERS || !env.SESSION_SECRET) return Response.json({ error: "not set up yet" }, { status: 503 });

		if (url.pathname === "/api/login" && req.method === "POST") {
			const room = env.ROOM.get(env.ROOM.idFromName("us"));
			const ip = req.headers.get("CF-Connecting-IP") ?? "local";
			if (!(await room.allowLogin(ip))) return Response.json({ error: "too many tries" }, { status: 429 });
			const body = (await req.json().catch(() => null)) as { passcode?: unknown } | null;
			const passcode = typeof body?.passcode === "string" ? body.passcode.slice(0, 200) : "";
			const who = passcode ? await matchPasscode(passcode, env.USERS) : null;
			if (!who) {
				await room.failedLogin(ip);
				await new Promise((r) => setTimeout(r, 1000));
				return Response.json({ error: "wrong passcode" }, { status: 401 });
			}
			return Response.json({ who }, { headers: { "Set-Cookie": sessionCookie(await signToken(who, env.SESSION_SECRET)) } });
		}

		if (url.pathname === "/api/logout" && req.method === "POST") {
			return new Response(null, { status: 204, headers: { "Set-Cookie": sessionCookie("", 0) } });
		}

		const token = readCookie(req);
		const who = token ? await verifyToken(token, env.SESSION_SECRET) : null;
		if (!who) return Response.json({ error: "unauthorized" }, { status: 401 });

		if (url.pathname === "/api/me") return Response.json({ who });

		if (url.pathname === "/api/turn") {
			// Relays for networks that block a direct connection. Both are optional and can be combined:
			// - TURN_SERVER (var) + TURN_USERNAME / TURN_PASSWORD (secrets): fixed credentials, e.g. ExpressTURN's free plan.
			// - TURN_URL (secret): a Metered/Open Relay credentials URL (it returns an iceServers array).
			const turn: unknown[] = [];
			if (env.TURN_SERVER && env.TURN_USERNAME && env.TURN_PASSWORD) {
				const host = env.TURN_SERVER;
				turn.push({ urls: [`turn:${host}?transport=udp`, `turn:${host}?transport=tcp`], username: env.TURN_USERNAME, credential: env.TURN_PASSWORD });
			}
			if (env.TURN_URL) {
				try {
					const res = await fetch(env.TURN_URL);
					const j = (await res.json()) as unknown;
					turn.push(...(Array.isArray(j) ? j : ((j as { iceServers?: unknown[] })?.iceServers ?? [])));
				} catch {
					console.warn("TURN_URL did not return ice servers"); // the call still works on direct/STUN paths
				}
			}
			return Response.json({ iceServers: [...STUN, ...turn] }, { headers: { "Cache-Control": "no-store" } });
		}

		if (url.pathname === "/api/songs") {
			const res = await env.ROOM.get(env.ROOM.idFromName("us")).songSearch(url.searchParams.get("q")?.slice(0, 200) ?? "");
			return Response.json(res, { headers: { "Cache-Control": "no-store" } });
		}

		// Send a pic: the JPEG is the body (the browser shrinks it first), the line written on it is ?note=.
		if (url.pathname === "/api/pic" && req.method === "POST") {
			if (Number(req.headers.get("Content-Length")) > LIMITS.picBytes) return Response.json({ error: "big" }, { status: 413 });
			const bytes = await req.arrayBuffer();
			if (bytes.byteLength > LIMITS.picBytes) return Response.json({ error: "big" }, { status: 413 });
			const res = await env.ROOM.get(env.ROOM.idFromName("us")).postPic(who, bytes, url.searchParams.get("note")?.slice(0, 400) ?? "");
			return Response.json(res, { status: "error" in res ? (res.error === "locked" ? 409 : 400) : 200 });
		}
		const picId = url.pathname.match(/^\/api\/pic\/([0-9a-f]{32})$/)?.[1];
		if (picId) {
			const bytes = await env.ROOM.get(env.ROOM.idFromName("us")).pic(picId);
			if (!bytes) return Response.json({ error: "gone" }, { status: 404 });
			// a new photo always gets a new id, so this one never changes
			return new Response(bytes, { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=31536000, immutable" } });
		}

		if (url.pathname === "/ws") {
			if (req.headers.get("Upgrade") !== "websocket") return new Response("expected websocket", { status: 426 });
			if (req.headers.get("Origin") !== url.origin) return new Response("bad origin", { status: 403 });
			const headers = new Headers(req.headers);
			headers.set("X-Who", who); // overwrites anything the client sent
			return env.ROOM.get(env.ROOM.idFromName("us")).fetch(new Request(req, { headers }));
		}

		return Response.json({ error: "not found" }, { status: 404 });
	},
} satisfies ExportedHandler<Env>;
