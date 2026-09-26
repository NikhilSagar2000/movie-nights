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
			// TURN_URL: a Metered/Open Relay credentials URL (it returns an iceServers array). Optional.
			let turn: unknown[] = [];
			if (env.TURN_URL) {
				try {
					const res = await fetch(env.TURN_URL);
					const j = (await res.json()) as unknown;
					turn = Array.isArray(j) ? j : ((j as { iceServers?: unknown[] })?.iceServers ?? []);
				} catch {
					console.warn("TURN_URL did not return ice servers"); // the call still works on direct/STUN paths
				}
			}
			return Response.json({ iceServers: [...STUN, ...turn] }, { headers: { "Cache-Control": "no-store" } });
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
