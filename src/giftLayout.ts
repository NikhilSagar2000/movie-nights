// Where things go in a gift. Pure and seeded, so the sender's preview and the recipient's screen are identical.
import type { Chocolates, FlowerId, Stem } from "../shared/gift";

/** A small seeded random generator (mulberry32): the same seed always gives the same numbers. */
export function seeded(seed: number) {
	let a = seed >>> 0 || 1;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/* The bouquet is drawn in a 200 × 240 box; the ribbon ties the stems at TIE, the heads fill a dome above it. */
export const TIE = { x: 100, y: 172 };
/** The dome the heads fill: tighter for a few stems, full for many. */
export const dome = (n: number) => ({ x: 100, y: 94, rx: Math.min(58, 24 + n * 3.4), ry: Math.min(42, 18 + n * 2.4) });
/** Big blooms go in the middle, sprays and spikes around the edge. */
const RING: Record<FlowerId, number> = { sunflower: 0, rose: 0, lily: 0, tulip: 1, daisy: 1, little: 1, tuberose: 2, lavender: 2, gypsophila: 2 };

export type Head = { i: number; x: number; y: number; r: number; s: number; delay: number };

/** Where each stem's head sits (drawn back to front), from the stems and the bouquet's seed. */
export function bouquetLayout(stems: Stem[], seed: number): Head[] {
	const rand = seeded(seed);
	const n = stems.length;
	const DOME = dome(n);
	// spots spread over the dome, centre first (a sunflower-seed spiral, squashed to the dome and kept above the paper)
	const spots = Array.from({ length: n }, (_, k) => {
		const a = k * 2.39996 + rand() * 0.5;
		const d = Math.sqrt((k + 0.5) / n) * (n > 1 ? 1 : 0);
		return { x: DOME.x + Math.cos(a) * d * DOME.rx, y: DOME.y + Math.sin(a) * d * DOME.ry * (Math.sin(a) > 0 ? 0.7 : 1), d };
	});
	// stems in ring order (big ones first), shuffled within each ring so "Rearrange" moves them around
	const order = stems.map((s, i) => ({ i, ring: RING[s.f], k: rand() })).sort((p, q) => p.ring - q.ring || p.k - q.k);
	const s = Math.max(1.12, Math.min(1.75, 2 - n * 0.06)); // fewer stems, bigger blooms
	const heads = order.map(({ i }, k) => {
		const p = spots[k];
		const x = p.x + (rand() - 0.5) * 6,
			y = p.y + (rand() - 0.5) * 6;
		return { i, x: round(x), y: round(y), r: round(((x - DOME.x) / Math.max(DOME.rx, 30)) * 16 + (rand() - 0.5) * 10), s: round(s * (0.92 + rand() * 0.16)), delay: round(rand() * -4) };
	});
	return heads.sort((p, q) => p.y - q.y); // lower heads in front
}
const round = (v: number) => Math.round(v * 100) / 100;

/* ---------- the chocolate box ---------- */

/** The heart outline, as points in a unit box (0–1, y down): the classic 16 sin³t heart. */
export const HEART = Array.from({ length: 72 }, (_, k) => {
	const t = (k / 72) * Math.PI * 2;
	const x = 16 * Math.sin(t) ** 3;
	const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
	return [round((x + 17) / 34), round((12.5 - y) / 30)] as [number, number];
});
export function inside([x, y]: [number, number], poly = HEART) {
	let hit = false;
	for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
		const [xi, yi] = poly[i],
			[xj, yj] = poly[j];
		if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
	}
	return hit;
}

export type Cell = { x: number; y: number; r: number };
const GRID: Record<Chocolates["size"], [number, number]> = { 4: [2, 2], 6: [3, 2], 9: [3, 3], 12: [4, 3] };

/** A box's size in its own units, and its cells (centre + radius). Square boxes are grids; heart boxes pack the heart. */
export function boxLayout(size: Chocolates["size"], box: Chocolates["box"]): { w: number; h: number; cells: Cell[] } {
	if (box === "square") {
		const [cols, rows] = GRID[size];
		const pitch = 30;
		return {
			w: cols * pitch + 16,
			h: rows * pitch + 16,
			cells: Array.from({ length: size }, (_, k) => ({ x: 8 + pitch * ((k % cols) + 0.5), y: 8 + pitch * (Math.floor(k / cols) + 0.5), r: 12.5 })),
		};
	}
	const packed = heartCells(size);
	const w = Math.round(Math.min(190, Math.max(96, 12.5 / packed[0][2]))); // chocolates the same size as in a square box
	const h = Math.round(w * (30 / 34));
	return { w, h, cells: packed.map(([x, y, r]) => ({ x: round(x * w), y: round(y * h), r: round(r * w) })) };
}

/** `n` cells packed into the heart (unit box, radius in width units): the biggest round cells a staggered grid can fit,
 *  trying a few grid offsets for each size. */
export function heartCells(n: number): [number, number, number][] {
	const K = 30 / 34; // the heart's height over its width: cells are laid out in width units, then y is scaled to the unit box
	const margin = 0.025;
	const fits = (x: number, y: number) => inside([x, y / K]);
	for (let pitch = 0.36; pitch > 0.08; pitch -= 0.004) {
		const r = pitch * 0.44;
		for (const dy of [0, 0.25, 0.5, 0.75]) {
			for (const dx of [0, 0.5]) {
				const pts: [number, number, number][] = [];
				for (let row = 0, y = r + margin + dy * pitch * 0.87; y < K; row++, y += pitch * 0.87) {
					for (let j = -8; j <= 8; j++) {
						const x = 0.5 + (j + dx + (row % 2) / 2) * pitch;
						const around = Array.from({ length: 12 }, (_, k) => [x + Math.cos((k * Math.PI) / 6) * (r + margin), y + Math.sin((k * Math.PI) / 6) * (r + margin)]);
						if (fits(x, y) && around.every(([a, b]) => fits(a, b))) pts.push([round(x), round(y / K), round(r)]);
					}
				}
				if (pts.length >= n)
					// keep the n nearest the heart's middle, then read them in rows
					return pts
						.sort((p, q) => Math.hypot(p[0] - 0.5, p[1] - 0.45) - Math.hypot(q[0] - 0.5, q[1] - 0.45))
						.slice(0, n)
						.sort((p, q) => p[1] - q[1] || p[0] - q[0]);
			}
		}
	}
	return [];
}
