import { PEOPLE, type Who } from "../shared/types";

const enc = new TextEncoder();
const DAY = 86_400;
export const COOKIE = "sess";
export const MAX_AGE = 30 * DAY;

const b64url = (buf: ArrayBuffer) =>
	btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

const hmacKey = (secret: string) =>
	crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);

/** Token = `who.expiry.signature`. */
export async function signToken(who: Who, secret: string, now = Date.now()): Promise<string> {
	const body = `${who}.${Math.floor(now / 1000) + MAX_AGE}`;
	const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(body));
	return `${body}.${b64url(sig)}`;
}

export async function verifyToken(token: string, secret: string, now = Date.now()): Promise<Who | null> {
	const [who, exp, sig] = token.split(".");
	if (!PEOPLE.includes(who as Who) || !/^\d+$/.test(exp ?? "") || !sig) return null;
	if (Number(exp) < now / 1000) return null;
	try {
		// subtle.verify is a constant-time comparison.
		const ok = await crypto.subtle.verify("HMAC", await hmacKey(secret), unb64url(sig), enc.encode(`${who}.${exp}`));
		return ok ? (who as Who) : null;
	} catch {
		return null; // malformed base64
	}
}

/** Constant-time check of a passcode against every person's passcode; returns who matched. */
export async function matchPasscode(passcode: string, usersJson: string): Promise<Who | null> {
	const users = JSON.parse(usersJson) as Partial<Record<Who, string>>;
	const digest = async (s: string) => new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(s)));
	const given = await digest(passcode);
	let found: Who | null = null;
	for (const who of PEOPLE) {
		const want = users[who];
		if (!want) continue;
		const w = await digest(want);
		let diff = 0;
		for (let i = 0; i < w.length; i++) diff |= w[i] ^ given[i];
		if (diff === 0) found = who; // no early exit: every entry is always compared
	}
	return found;
}

export function readCookie(req: Request, name = COOKIE): string | null {
	const m = req.headers.get("Cookie")?.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
	return m ? m[1] : null;
}

export const sessionCookie = (token: string, maxAge = MAX_AGE) =>
	`${COOKIE}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAge}`;
