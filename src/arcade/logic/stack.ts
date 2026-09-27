/* Ladoo Stack: a box slides over the stack; drop it and whatever hangs over the box below falls off. Pure: the view
   keeps the boxes, the camera and the falling bits. */

export type Span = { x: number; w: number };
export type Cut = Span & { perfect: boolean; miss: boolean; chip: Span | null };

export const PERFECT = 5;
/** The sliding box's centre bounces between these (the field is 360 wide). */
export const LO = 30;
export const HI = 330;

export const speed = (score: number) => Math.min(300, 140 + score * 5);

/** Where `cur` lands on `prev`: the overlap stays and the overhang is the chip that falls. Within `perfect` units it
 *  snaps on whole. No overlap at all is a miss: the whole box is the chip. */
export function cut(prev: Span, cur: Span, perfect = PERFECT): Cut {
	if (Math.abs(cur.x - prev.x) <= perfect) return { x: prev.x, w: cur.w, perfect: true, miss: false, chip: null };
	const l = Math.max(prev.x, cur.x);
	const r = Math.min(prev.x + prev.w, cur.x + cur.w);
	if (r <= l) return { x: cur.x, w: 0, perfect: false, miss: true, chip: { ...cur } };
	const chip = cur.x < prev.x ? { x: cur.x, w: l - cur.x } : { x: r, w: cur.x + cur.w - r };
	return { x: l, w: r - l, perfect: false, miss: false, chip };
}

/** Slides a box of width `w` by `d`, bouncing so its centre stays between LO and HI. */
export function slide(x: number, dir: 1 | -1, w: number, d: number): { x: number; dir: 1 | -1 } {
	let c = x + w / 2 + dir * d;
	if (c > HI) [c, dir] = [2 * HI - c, -1];
	if (c < LO) [c, dir] = [2 * LO - c, 1];
	return { x: c - w / 2, dir };
}
