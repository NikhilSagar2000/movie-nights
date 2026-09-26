import { describe, expect, it } from "vitest";
import { matchPasscode, readCookie, signToken, verifyToken } from "./auth";

const SECRET = "test-secret";
const USERS = JSON.stringify({ a: "pink teddy", b: "blue bunny" });

describe("session token", () => {
	it("round-trips", async () => {
		expect(await verifyToken(await signToken("b", SECRET), SECRET)).toBe("b");
	});

	it("rejects tampering, wrong secret, expiry and junk", async () => {
		const t = await signToken("a", SECRET);
		const [, exp, sig] = t.split(".");
		expect(await verifyToken(`b.${exp}.${sig}`, SECRET)).toBeNull(); // swapped identity
		expect(await verifyToken(`a.${Number(exp) + 1}.${sig}`, SECRET)).toBeNull(); // extended expiry
		expect(await verifyToken(t, "other-secret")).toBeNull();
		expect(await verifyToken(t, SECRET, Date.now() + 31 * 86_400_000)).toBeNull();
		for (const junk of ["", "a", "a.b.c", "x.1.abc", "a.1.***"]) expect(await verifyToken(junk, SECRET)).toBeNull();
	});
});

describe("passcode", () => {
	it("maps each passcode to its person", async () => {
		expect(await matchPasscode("pink teddy", USERS)).toBe("a");
		expect(await matchPasscode("blue bunny", USERS)).toBe("b");
		expect(await matchPasscode("pink tedd", USERS)).toBeNull();
		expect(await matchPasscode("", USERS)).toBeNull();
	});
});

it("reads the session cookie among others", () => {
	const req = new Request("https://x", { headers: { Cookie: "foo=1; sess=abc.def; bar=2" } });
	expect(readCookie(req)).toBe("abc.def");
	expect(readCookie(new Request("https://x"))).toBeNull();
});
