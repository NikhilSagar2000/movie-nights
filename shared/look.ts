import type { Who } from "./types";

/* Dress up: each person's look for their own drawn character. Pure rules shared by the Room (which enforces them) and the page. */

/** One worn item and its colour ("#rrggbb", or "hair" for cat ears that match the hair). */
export type Piece = { id: string; c: string };
/** skin/hair null = as drawn. */
export type Look = { skin: string | null; hair: string | null; head: Piece | null; eyes: Piece | null; cheeks: Piece | null; clip: Piece | null };
export type Looks = Partial<Record<Who, Look>>;
export type LookSlot = "head" | "eyes" | "cheeks" | "clip";

export const LOOK_ITEMS: Record<LookSlot, readonly string[]> = {
	head: ["beanie", "cat", "wreath", "halo", "phones"],
	eyes: ["hearts", "shades", "specs"],
	cheeks: ["blush", "freckles", "stars", "stickers"],
	clip: ["bow", "flower", "star"],
};
export const LOOK_SLOTS = Object.keys(LOOK_ITEMS) as LookSlot[];
/** Items only one of them can wear (his own glasses are part of the drawing). */
export const ONLY: Partial<Record<string, Who>> = { specs: "b" };
/** His flower, as drawn. */
export const HIS_FLOWER: Piece = { id: "flower", c: "#f7dd8d" };

/** How they look before they've dressed up: him with his flower, her as drawn. */
export const bareLook = (w: Who): Look => ({ skin: null, hair: null, head: null, eyes: null, cheeks: null, clip: w === "a" ? { ...HIS_FLOWER } : null });

const hex = (v: unknown) => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : null);

function piece(v: unknown, slot: LookSlot, who: Who): Piece | null {
	if (!v || typeof v !== "object") return null;
	const { id, c } = v as Partial<Piece>;
	if (typeof id !== "string" || !LOOK_ITEMS[slot].includes(id) || (ONLY[id] && ONLY[id] !== who)) return null;
	const color = id === "cat" && c === "hair" ? "hair" : hex(c);
	return color ? { id, c: color } : null;
}

/** A look as the Room stores it: known items only, real colours, nothing extra. Null if it isn't a look at all. */
export function cleanLook(v: unknown, who: Who): Look | null {
	if (!v || typeof v !== "object" || Array.isArray(v)) return null;
	const l = v as Record<string, unknown>;
	return {
		skin: hex(l.skin),
		hair: hex(l.hair),
		head: piece(l.head, "head", who),
		eyes: piece(l.eyes, "eyes", who),
		cheeks: piece(l.cheeks, "cheeks", who),
		clip: piece(l.clip, "clip", who),
	};
}
