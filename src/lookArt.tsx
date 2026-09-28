import type { CSSProperties, ReactNode } from "react";
import type { Who } from "../shared/types";
import { LOOK_SLOTS, type Look } from "../shared/look";

/* Dress up: the things you can wear, drawn inside the head's svg (so every mood and moment carries them).
   Units are the head's own viewBox (her 51.4 × 78.1, his 59.2 × 61.3), measured on the drawings in the prototype
   (design: https://claude.ai/artifact/2RFnVeVE54FWeNnm9Bc9pM). Lines are the head's ink (currentColor); fills are --c. */

type Frame = { x: number; y: number; s: number; r: number };
type Eye = [x: number, y: number, rx: number, ry: number];
type Anchors = {
	/** Hats are drawn around the top of a head 40 units wide; this moves and sizes them onto the drawing. */
	top: Frame;
	/** Her left eye is the far one (the face turns a little), so it's smaller. His lenses tilt about 5°. */
	eyes: { l: Eye; r: Eye; tilt: number };
	cheeks: { l: [number, number]; r: [number, number]; s: number };
	/** Where a clip goes: the side of her hair; for him, where his flower grows. */
	side: Frame;
	/** Headphone cups, and how high the band peaks over the head. */
	ears: { l: [number, number]; r: [number, number]; peak: number };
};
const ANCHORS: Record<Who, Anchors> = {
	b: {
		top: { x: 24, y: 1, s: 1.05, r: 0 },
		eyes: { l: [10.8, 34.5, 4.4, 4.8], r: [29.8, 36, 5.5, 5.5], tilt: 5 },
		cheeks: { l: [15.4, 40.6], r: [25.9, 41.4], s: 0.8 },
		side: { x: 41, y: 16.5, s: 1, r: 20 },
		ears: { l: [1.6, 32], r: [49, 32], peak: -0.4 },
	},
	a: {
		top: { x: 31, y: 3.5, s: 1.12, r: 3 },
		eyes: { l: [20.8, 47.3, 8.2, 5.7], r: [42.2, 45.4, 8.2, 5.4], tilt: -5 },
		cheeks: { l: [21, 56.1], r: [41.4, 54.4], s: 1 },
		side: { x: 11, y: 30, s: 0.95, r: -18 },
		ears: { l: [5, 45], r: [54.5, 43], peak: 2.6 },
	},
};

const f = (n: number) => +n.toFixed(2);
const at = (a: Frame) => `translate(${a.x} ${a.y}) rotate(${a.r}) scale(${a.s})`;
function heart(x: number, y: number, r: number) {
	const p = (a: number, b: number) => `${f(x + a * r)} ${f(y + b * r)}`;
	return `M${p(0, 0.95)}C${p(-0.25, 0.75)} ${p(-1, 0.3)} ${p(-1, -0.3)}C${p(-1, -0.75)} ${p(-0.65, -1)} ${p(-0.32, -1)}C${p(-0.12, -1)} ${p(0, -0.86)} ${p(0, -0.72)}C${p(0, -0.86)} ${p(0.12, -1)} ${p(0.32, -1)}C${p(0.65, -1)} ${p(1, -0.75)} ${p(1, -0.3)}C${p(1, 0.3)} ${p(0.25, 0.75)} ${p(0, 0.95)}Z`;
}
function star(x: number, y: number, r: number) {
	let d = "";
	for (let i = 0; i < 10; i++) {
		const a = (Math.PI / 5) * i - Math.PI / 2,
			rr = i % 2 ? r * 0.48 : r;
		d += `${i ? "L" : "M"}${f(x + Math.cos(a) * rr)} ${f(y + Math.sin(a) * rr)}`;
	}
	return `${d}Z`;
}
/** The little flower (the #flower symbol), centred on x,y. */
const Bloom = ({ x, y, w, r, color }: { x: number; y: number; w: number; r: number; color: string }) => (
	<g transform={`translate(${x} ${y}) rotate(${r})`} style={{ "--petal": color } as CSSProperties}>
		<use href="#flower" x={-w / 2} y={-w / 2} width={w} height={w} />
	</g>
);
const both = (e: { l: Eye | [number, number]; r: Eye | [number, number] }, draw: (p: number[], side: "l" | "r") => ReactNode) => (
	<>
		{draw(e.l, "l")}
		{draw(e.r, "r")}
	</>
);
/** The nose piece, from the inner top of one lens to the other (k = how far out a lens reaches, as a share of its rx). */
function Bridge({ e, k }: { e: Anchors["eyes"]; k: number }) {
	const [lx, ly, lrx, lry] = e.l,
		[rx, ry, rrx, rry] = e.r;
	const x1 = lx + lrx * k,
		y1 = ly - lry * 0.3,
		x2 = rx - rrx * k,
		y2 = ry - rry * 0.3;
	return <path className="lk-wire" d={`M${f(x1)} ${f(y1)}Q${f((x1 + x2) / 2)} ${f(Math.min(y1, y2) - 1.4)} ${f(x2)} ${f(y2)}`} />;
}

type Art = (A: Anchors) => ReactNode;
const WREATH = [
	[-17, 6.4, -24],
	[-11.4, 8.3, -10],
	[-5.7, 9.2, 4],
	[0, 9.5, 16],
	[5.7, 9.2, -6],
	[11.4, 8.3, 10],
	[17, 6.4, 24],
];
/** Hats, in the 40-wide frame at the top of the head. */
const HATS: Record<string, () => ReactNode> = {
	beanie: () => (
		<>
			<path className="lk-c lk-o" d="M-20.5 8C-21-5-11-11.5 0-11.5S21-5 20.5 8Z" />
			<rect className="lk-c lk-o" x={-22.5} y={5} width={45} height={7.5} rx={3.6} />
			<rect className="lk-dim" x={-22} y={5.5} width={44} height={6.5} rx={3.2} />
			<path className="lk-rib" d="M-17 7v3.6M-12 7v3.6M-7 7v3.6M-2 7v3.6M3 7v3.6M8 7v3.6M13 7v3.6M18 7v3.6" />
			<circle className="lk-cream lk-o" cy={-13.2} r={4.2} />
		</>
	),
	// drawn behind the head: the corners sit inside the hair, so only the tips come out
	cat: () => (
		<>
			<path className="lk-c lk-o" d="M-16.5 10L-16-9.5L-4 2Z" />
			<path className="lk-pink" d="M-14.8 5.4L-14.4-4.6L-7.2 1.6Z" />
			<path className="lk-c lk-o" d="M16.5 10L16-9.5L4 2Z" />
			<path className="lk-pink" d="M14.8 5.4L14.4-4.6L7.2 1.6Z" />
		</>
	),
	wreath: () => (
		<>
			{WREATH.slice(0, -1).map(([x, y], i) => {
				const cx = f((x + WREATH[i + 1][0]) / 2),
					cy = f((y + WREATH[i + 1][1]) / 2 + 1.3);
				return <ellipse key={i} className="lk-leaf lk-o" cx={cx} cy={cy} rx={1.9} ry={1} transform={`rotate(${i % 2 ? 25 : -25} ${cx} ${cy})`} />;
			})}
			{WREATH.map(([x, y, r], i) => (
				<Bloom key={i} x={x} y={y} w={6.6} r={r} color={i % 2 ? "var(--cream)" : "var(--c)"} />
			))}
		</>
	),
	halo: () => (
		<g className="lk-float">
			<ellipse className="lk-ring-o" cy={-9} rx={13} ry={3.4} />
			<ellipse className="lk-ring-c" cy={-9} rx={13} ry={3.4} />
		</g>
	),
};
/** Everything else, placed at the eyes, cheeks, ears or the side of the hair. */
const PLACED: Record<string, Art> = {
	phones: ({ ears: e }) => {
		const [lx, ly] = e.l,
			[rx, ry] = e.r;
		const cy = f((e.peak - 0.125 * (ly - 4 + ry - 4)) / 0.75); // the band's control points, so its top reaches `peak`
		const band = `M${lx} ${ly - 4}C${lx - 3} ${cy} ${rx + 3} ${cy} ${rx} ${ry - 4}`;
		return (
			<>
				<path className="lk-band-o" d={band} />
				<path className="lk-band-c" d={band} />
				{both(e, ([x, y]) => (
					<>
						<rect className="lk-c lk-o" x={x - 4} y={y - 6.5} width={8} height={13} rx={3.6} />
						<rect className="lk-dim" x={x - 2.3} y={y - 4.6} width={4.6} height={9.2} rx={2.3} />
					</>
				))}
			</>
		);
	},
	hearts: ({ eyes: e }) => (
		<>
			<Bridge e={e} k={1} />
			{both(e, ([x, y, rx, ry]) => {
				const r = Math.max(rx, ry) * 1.1;
				return (
					<g transform={`rotate(${e.tilt} ${x} ${y})`}>
						<path className="lk-lens lk-o" d={heart(x, y + r * 0.08, r)} />
						<path className="lk-shine" d={`M${f(x - r * 0.6)} ${f(y - r * 0.2)}q${f(r * 0.1)} ${f(-r * 0.45)} ${f(r * 0.45)} ${f(-r * 0.5)}`} />
					</g>
				);
			})}
		</>
	),
	shades: ({ eyes: e }) => (
		<>
			<Bridge e={e} k={1} />
			{both(e, ([x, y, rx, ry]) => {
				const w = rx * 1.06,
					h = ry * 1.08;
				return (
					<g transform={`rotate(${e.tilt} ${x} ${y})`}>
						<ellipse className="lk-lens lk-o" cx={x} cy={y} rx={f(w)} ry={f(h)} />
						<path className="lk-shine" d={`M${f(x - w * 0.55)} ${f(y - h * 0.2)}q${f(w * 0.15)} ${f(-h * 0.5)} ${f(w * 0.55)} ${f(-h * 0.55)}`} />
					</g>
				);
			})}
		</>
	),
	specs: ({ eyes: e }) => (
		<>
			<Bridge e={e} k={1.08} />
			{both(e, ([x, y, rx, ry]) => (
				<>
					<ellipse className="lk-ring-o" cx={x} cy={y} rx={f(rx * 1.08)} ry={f(ry * 1.06)} />
					<ellipse className="lk-ring-c" cx={x} cy={y} rx={f(rx * 1.08)} ry={f(ry * 1.06)} />
				</>
			))}
		</>
	),
	blush: ({ cheeks: c }) =>
		both(c, ([x, y]) => (
			<>
				<ellipse className="lk-c lk-soft" cx={x} cy={y} rx={f(3.4 * c.s)} ry={f(2 * c.s)} />
				{[-1.4, 0, 1.4].map((d) => (
					<path key={d} className="lk-hatch" d={`M${f(x + (d - 0.4) * c.s)} ${f(y + 0.9 * c.s)}L${f(x + (d + 0.4) * c.s)} ${f(y - 0.9 * c.s)}`} />
				))}
			</>
		)),
	freckles: ({ cheeks: c }) =>
		both(c, ([x, y]) =>
			[
				[-1.9, -0.3],
				[0, 0.6],
				[1.8, -0.2],
				[0.1, -1.2],
				[-1, 1.4],
				[1.2, 1.2],
			].map(([dx, dy], i) => <circle key={i} className="lk-c" cx={f(x + dx * c.s)} cy={f(y + dy * c.s)} r={f(0.55 * c.s)} />),
		),
	stars: ({ cheeks: c }) => both(c, ([x, y], s) => <path className="lk-c lk-o" d={star(x, y, 2 * c.s)} transform={`rotate(${s === "l" ? -12 : 14} ${x} ${y})`} />),
	stickers: ({ cheeks: c }) => both(c, ([x, y], s) => <path className="lk-c lk-o" d={heart(x, y, 1.8 * c.s)} transform={`rotate(${s === "l" ? -14 : 12} ${x} ${y})`} />),
	bow: ({ side }) => (
		<g transform={at(side)}>
			<path className="lk-c lk-o" d="M-.8 .8L-4 8.2L-1.6 7.2L-.3 8.8L.5 1ZM.8 .8L3.8 8.4L1.4 7.4L.2 8.9Z" />
			<path className="lk-c lk-o" d="M0 0C-2.5-4.5-9-5.5-9 0S-2.5 4.5 0 0ZM0 0C2.5-4.5 9-5.5 9 0S2.5 4.5 0 0Z" />
			<path className="lk-dim" d="M-2 0C-3.5-2.2-6.5-2.8-6.8 0C-6.5 2.4-3.5 1.8-2 0ZM2 0C3.5-2.2 6.5-2.8 6.8 0C6.5 2.4 3.5 1.8 2 0Z" />
			<circle className="lk-c lk-o" r={2} />
		</g>
	),
	// her flower clip (his is his own flower, drawn by Head)
	flower: ({ side }) => (
		<g transform={at(side)}>
			<Bloom x={4.8} y={4.4} w={7.4} r={30} color="var(--blush)" />
			<Bloom x={0} y={0} w={11} r={-8} color="var(--c)" />
		</g>
	),
	star: ({ side }) => (
		<g transform={at(side)}>
			<path className="lk-c lk-o" d={star(0, 0, 5.4)} />
			<path className="lk-shine" d="M-2-1.4l1.2-2" />
		</g>
	),
};

/** What someone is wearing, drawn in their head's svg. `back`: the layer behind the drawing (cat ears); otherwise the one in front. */
export function Worn({ who, look, back = false }: { who: Who; look: Look; back?: boolean }) {
	const A = ANCHORS[who];
	return (
		<>
			{LOOK_SLOTS.map((slot) => {
				const p = look[slot];
				if (!p || (p.id === "cat") !== back || (who === "a" && slot === "clip" && p.id === "flower")) return null;
				const art = slot === "head" && HATS[p.id] ? <g transform={at(A.top)}>{HATS[p.id]()}</g> : PLACED[p.id]?.(A);
				if (!art) return null; // an item this version doesn't know (a look saved by a newer tab)
				const c = p.c === "hair" ? (look.hair ?? "currentColor") : p.c;
				return (
					<g key={slot} className={`lk-${slot}`} style={{ "--c": c } as CSSProperties}>
						{art}
					</g>
				);
			})}
		</>
	);
}
