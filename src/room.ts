import { useSyncExternalStore } from "react";
import type { ClientMsg, JarItem, RelayData, ServerMsg, Snapshot, Who } from "../shared/types";

/** New on every page load, so the partner can tell a refresh (new call needed) from a Wi-Fi blip (keep the call). */
export const sessionId = crypto.randomUUID();

export type RoomState = Snapshot & {
	connected: boolean;
	/** Another tab of the same person took over this room. */
	replaced: boolean;
	picked: { item: JarItem; by: Who; at: number } | null;
};

let state: RoomState | null = null;
let ws: WebSocket | null = null;
let queue: string[] = [];
let retry = 0;
let lastSeen = 0;
let pingAt = 0;
let onUnauthorized = () => {};
let skew = 0;
/** The Room's clock (this device's clock corrected by the offset seen on connect), so countdowns agree on both screens. */
export const serverNow = () => Date.now() + skew;
const listeners = new Set<() => void>();
const relayListeners = new Set<(from: Who, data: RelayData) => void>();

function set(patch: Partial<RoomState>) {
	if (!state) return;
	state = { ...state, ...patch };
	listeners.forEach((l) => l());
}

function handle(m: ServerMsg) {
	switch (m.t) {
		case "init": {
			const { t: _, ...snap } = m;
			skew = m.now - Date.now();
			state = { ...snap, connected: true, replaced: false, picked: state?.picked ?? null };
			return listeners.forEach((l) => l());
		}
		case "presence":
			return set({ online: m.online });
		case "relay":
			return relayListeners.forEach((l) => l(m.from, m.data));
		case "profiles":
			return set({ profiles: m.profiles });
		case "chat":
			return set({ chat: [...(state?.chat ?? []), m.msg].slice(-200) });
		case "jar":
			return set({ jar: m.jar });
		case "jar:picked":
			return set({ picked: { item: m.item, by: m.by, at: Date.now() } });
		case "stubs":
			return set({ stubs: m.stubs });
		case "letters":
			return set({ letters: m.letters });
		case "tube":
			return set({ tube: m.tube });
		case "garden":
			return set({ garden: m.garden });
		case "game":
			return set({ game: m.game });
		case "sealed":
			return set({ sealed: m.sealed });
	}
}

export function connect(unauthorized: () => void) {
	onUnauthorized = unauthorized;
	if (ws && ws.readyState <= WebSocket.OPEN) return;
	const socket = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws?sid=${sessionId}`);
	ws = socket;
	socket.onopen = () => {
		retry = 0;
		lastSeen = Date.now();
		queue.forEach((m) => socket.send(m));
		queue = [];
	};
	socket.onmessage = (e) => {
		lastSeen = Date.now();
		if (e.data !== "pong") handle(JSON.parse(e.data));
	};
	socket.onclose = (e) => void lost(socket, e.code);
}

async function lost(socket: WebSocket, code: number) {
	if (ws !== socket) return;
	ws = null;
	set({ connected: false });
	if (code === 4000) return set({ replaced: true });
	// A refused upgrade looks like any other drop; ask the API whether the session is still valid.
	const me = await fetch("/api/me").catch(() => null);
	if (me?.status === 401) return onUnauthorized();
	setTimeout(() => connect(onUnauthorized), Math.min(10_000, 500 * 2 ** retry++));
}

// Heartbeat: the Room answers "ping" without waking up. An unanswered ping means a half-open socket: reconnect now,
// without waiting for close() (it can hang for a minute on a dead connection). Throttled background timers only
// make pings rarer; they can't cause a false alarm, because any message counts as an answer.
setInterval(() => {
	const socket = ws;
	if (socket?.readyState !== WebSocket.OPEN) return;
	if (pingAt > lastSeen && Date.now() - pingAt > 10_000) {
		socket.onclose = null;
		socket.close();
		return void lost(socket, 1006);
	}
	pingAt = Date.now();
	socket.send("ping");
}, 15_000);

export function send(m: ClientMsg) {
	const data = JSON.stringify(m);
	if (ws?.readyState === WebSocket.OPEN) ws.send(data);
	else if (queue.length < 100) queue.push(data);
}

export const relay = (data: RelayData) => send({ t: "relay", data });

export function onRelay(fn: (from: Who, data: RelayData) => void) {
	relayListeners.add(fn);
	return () => void relayListeners.delete(fn);
}

export function subscribe(fn: () => void) {
	listeners.add(fn);
	return () => void listeners.delete(fn);
}

export const getRoom = () => state;
export const useRoom = () => useSyncExternalStore(subscribe, getRoom);

/** Display name + color for a person, with soft defaults until they pick their own. */
/** The ring colors you can pick for your love. Defaults: a = blush, b = misty sky. */
export const RINGS = [
	{ name: "Blush", hex: "#f7c8d3" },
	{ name: "Misty sky", hex: "#a9b7c6" },
	{ name: "Sage", hex: "#a8b58a" },
	{ name: "Haze", hex: "#eaeff4" },
	{ name: "Rosewood", hex: "#b46a72" },
];
export const ringOf = (who: Who, color?: string) => RINGS.find((r) => r.hex === color?.toLowerCase())?.hex ?? (who === "a" ? RINGS[0].hex : RINGS[1].hex);

export function profileOf(room: RoomState, who: Who) {
	const p = room.profiles[who];
	// colors picked in the old pink theme aren't in RINGS; they fall back to the default ring
	return { name: p?.name ?? (who === room.you ? "You" : "Your love"), color: ringOf(who, p?.color) };
}

export async function logout() {
	await fetch("/api/logout", { method: "POST" }).catch(() => {});
	location.hash = "";
	location.reload();
}
