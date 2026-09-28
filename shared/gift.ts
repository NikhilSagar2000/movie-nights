/* A gift that travels with a letter: a bouquet and/or a box of chocolates. Pure rules shared by the Room (which
   enforces them) and the page. Colours end up in SVG fills, so only #rrggbb gets through. */

/** Each flower and the colours it comes in (the first is its default). */
export const FLOWERS = {
	rose: ["#d64550", "#f4a3b4", "#fff7e6", "#f6b48f", "#f7dd8d"],
	tulip: ["#e0506a", "#f4a3b4", "#f7dd8d", "#fff7e6", "#a98bd6"],
	tuberose: ["#fffcf5"],
	sunflower: ["#f5c23a"],
	daisy: ["#fffcf5", "#f7c8d3"],
	lily: ["#fffcf5", "#f4a3b4", "#f6a15c"],
	lavender: ["#9b86c9"],
	gypsophila: ["#fffcf5"],
	little: ["#f7dd8d", "#f4a3b4", "#fff7e6", "#c3b1e1"],
} as const satisfies Record<string, readonly string[]>;
export type FlowerId = keyof typeof FLOWERS;
export const FLOWER_IDS = Object.keys(FLOWERS) as FlowerId[];
export const WRAPS = ["kraft", "tissue", "clear", "news"] as const;
export const SHAPES = ["round", "square", "heart", "truffle"] as const;
export const FLAVORS = ["dark", "milk", "white", "ruby", "caramel"] as const;
export const TOPS = ["none", "drizzle", "nuts", "sprinkles", "gold"] as const;
export const BOX_SIZES = [4, 6, 9, 12] as const;
export const BOXES = ["square", "heart"] as const;
export const MAX_STEMS = 15;

export type Stem = { f: FlowerId; c: string };
export type Bouquet = { stems: Stem[]; wrap: (typeof WRAPS)[number]; wrapColor: string; ribbon: string; seed: number };
export type Choc = { shape: (typeof SHAPES)[number]; flavor: (typeof FLAVORS)[number]; top: (typeof TOPS)[number] };
export type Chocolates = { size: (typeof BOX_SIZES)[number]; box: (typeof BOXES)[number]; boxColor: string; ribbon: string; pieces: (Choc | null)[]; eaten?: number[] };
export type Gift = { bouquet?: Bouquet; chocolates?: Chocolates };

const hex = (v: unknown) => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : null);
const oneOf = <T extends string | number>(list: readonly T[], v: unknown): T | null => (list.includes(v as T) ? (v as T) : null);
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

function cleanBouquet(v: unknown): Bouquet | undefined {
	const b = obj(v);
	if (!b || !Array.isArray(b.stems)) return;
	const stems: Stem[] = [];
	for (const s of b.stems.slice(0, MAX_STEMS)) {
		const f = oneOf(FLOWER_IDS, obj(s)?.f);
		const c = hex(obj(s)?.c);
		if (f && c && (FLOWERS[f] as readonly string[]).includes(c)) stems.push({ f, c });
	}
	const wrap = oneOf(WRAPS, b.wrap);
	if (!stems.length || !wrap) return;
	const seed = Number.isFinite(b.seed) ? Math.abs(Math.trunc(b.seed as number)) % 2 ** 31 : 1;
	return { stems, wrap, wrapColor: hex(b.wrapColor) ?? "#f7c8d3", ribbon: hex(b.ribbon) ?? "#b46a72", seed };
}

function cleanChoc(v: unknown): Choc | null {
	const c = obj(v);
	const shape = oneOf(SHAPES, c?.shape),
		flavor = oneOf(FLAVORS, c?.flavor),
		top = oneOf(TOPS, c?.top);
	return shape && flavor && top ? { shape, flavor, top } : null;
}

function cleanChocolates(v: unknown): Chocolates | undefined {
	const c = obj(v);
	const size = oneOf(BOX_SIZES, c?.size);
	const box = oneOf(BOXES, c?.box);
	const raw = c?.pieces;
	if (!c || !size || !box || !Array.isArray(raw)) return;
	const pieces = Array.from({ length: size }, (_, i) => cleanChoc(raw[i]));
	if (!pieces.some(Boolean)) return; // an empty box isn't a gift
	return { size, box, boxColor: hex(c.boxColor) ?? "#b46a72", ribbon: hex(c.ribbon) ?? "#f7c8d3", pieces };
}

/** A gift as the Room stores it: known things only, real colours, nothing extra, nothing eaten yet. Undefined if nothing valid is left. */
export function cleanGift(v: unknown): Gift | undefined {
	const g = obj(v);
	if (!g) return;
	const bouquet = cleanBouquet(g.bouquet);
	const chocolates = cleanChocolates(g.chocolates);
	if (!bouquet && !chocolates) return;
	return { ...(bouquet && { bouquet }), ...(chocolates && { chocolates }) };
}

/** The gift after the chocolate in cell `i` is eaten, or null if there's nothing there to eat. */
export function eat(gift: Gift | undefined, i: unknown): Gift | null {
	const c = gift?.chocolates;
	if (!c || !Number.isInteger(i) || (i as number) < 0 || (i as number) >= c.size || !c.pieces[i as number]) return null;
	if (c.eaten?.includes(i as number)) return null;
	return { ...gift, chocolates: { ...c, eaten: [...(c.eaten ?? []), i as number] } };
}

/** How many chocolates are still in the box, and how many it started with. */
export const chocolatesLeft = (gift: Gift | undefined) => {
	const c = gift?.chocolates;
	if (!c) return null;
	const total = c.pieces.filter(Boolean).length;
	return { left: total - (c.eaten?.length ?? 0), total };
};
