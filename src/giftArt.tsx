// The gift's drawings: a bouquet (flowers, wrapper, ribbon) and a box of chocolates. Flat colour with the app's ink
// line (currentColor), like the heads. Everything is placed with CSS transforms so changes glide (src/gift.css, gf-*).
import { useEffect, useId, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import type { Bouquet, Choc, Chocolates, FlowerId } from "../shared/gift";
import { bouquetLayout, boxLayout, dome, HEART, seeded, TIE, type Cell } from "./giftLayout";
import "./gift.css";

const f = (n: number) => +n.toFixed(2);
const css = (v: Record<string, string | number>) => v as CSSProperties;
/** A round flower outline with n bumps. */
function scallop(r: number, n: number, bulge = 1.25, turn = 0) {
	let d = "";
	for (let k = 0; k <= n; k++) {
		const a = (k / n) * Math.PI * 2 - Math.PI / 2 + turn;
		if (!k) {
			d = `M${f(Math.cos(a) * r)} ${f(Math.sin(a) * r)}`;
			continue;
		}
		const m = a - Math.PI / n;
		d += `Q${f(Math.cos(m) * r * bulge)} ${f(Math.sin(m) * r * bulge)} ${f(Math.cos(a) * r)} ${f(Math.sin(a) * r)}`;
	}
	return `${d}Z`;
}
/** The heart outline scaled to w × h, from (x, y). */
export const heartPath = (w: number, h: number, x = 0, y = 0) => `M${HEART.map(([a, b]) => `${f(x + a * w)} ${f(y + b * h)}`).join("L")}Z`;
const ring = (n: number, draw: (deg: number, k: number) => ReactNode) => Array.from({ length: n }, (_, k) => draw((k * 360) / n, k));

// ---------- flowers (each drawn around 0,0, about 34 units across) ----------
const FLOWER_ART: Record<FlowerId, () => ReactNode> = {
	rose: () => (
		<>
			<path className="gf-o gf-petal" d={scallop(15, 6, 1.3)} />
			<path className="gf-o gf-petal" d={scallop(10, 5, 1.32, 0.4)} />
			<path className="gf-swirl" d="M-4.5 1.5C-6-4 0-7.5 4.5-4.5C8-1.5 5 5 0 4.5C-3.5 4-3.5-1.5 0-2C2.5-2.3 3 1 1 1.5" />
		</>
	),
	tulip: () => (
		<g transform="translate(0 10) scale(1.85)">
			<path
				className="gf-o gf-petal gf-thin"
				d="M-7.5 -4 C-8.5 -10 -6.5 -15 -4.5 -17.5 C-3.5 -13.5 -2 -12.5 0 -18.5 C2 -12.5 3.5 -13.5 4.5 -17.5 C6.5 -15 8.5 -10 7.5 -4 C6.5 1.5 -6.5 1.5 -7.5 -4 Z"
			/>
			<path className="gf-crease" d="M0 -18 C-1.2 -12 -1.2 -6 0 -1" />
		</g>
	),
	tuberose: () => (
		<>
			<path className="gf-stalk" d="M0 19V-19" />
			{[
				[0, -20, 2.2],
				[-3.6, -15, 3],
				[3.6, -11.5, 3.3],
				[-4, -5.5, 3.6],
				[4, -0.5, 3.8],
				[-3.8, 5.5, 4],
				[3.6, 11, 4],
			].map(([x, y, r], k) => (
				<g key={k} transform={`translate(${x} ${y})`}>
					<path className={`gf-o gf-petal${k ? "" : " gf-bud"}`} d={scallop(r * 0.72, 6, 1.7)} />
					{k > 0 && <circle className="gf-heart-dot" r={r * 0.22} />}
				</g>
			))}
		</>
	),
	sunflower: () => (
		<>
			{ring(14, (deg) => (
				<ellipse key={deg} className="gf-o gf-petal" cy={-11.5} rx={3.3} ry={7.2} transform={`rotate(${deg})`} />
			))}
			<circle className="gf-o gf-seedhead" r={8.5} />
			{ring(7, (deg) => (
				<circle key={deg} className="gf-seed" cy={-4.6} r={1.1} transform={`rotate(${deg})`} />
			))}
			<circle className="gf-seed" r={1.3} />
		</>
	),
	daisy: () => (
		<>
			{ring(12, (deg) => (
				<ellipse key={deg} className="gf-o gf-petal" cy={-8.6} rx={2.7} ry={6.8} transform={`rotate(${deg})`} />
			))}
			<circle className="gf-o gf-yolk" r={4.8} />
		</>
	),
	lily: () => (
		<>
			{ring(6, (deg, k) => (
				<g key={deg} transform={`rotate(${deg + 30})`}>
					<path className="gf-o gf-petal" d="M0 -1.5C4.5-6.5 4.5-14 0-19.5C-4.5-14-4.5-6.5 0-1.5Z" />
					<path className="gf-crease" d="M0 -3V-15" />
					{k % 2 === 0 && <circle className="gf-spot" cy={-8} cx={1.4} r={0.8} />}
				</g>
			))}
			{ring(5, (deg) => (
				<g key={deg} transform={`rotate(${deg})`}>
					<path className="gf-filament" d="M0 0V-9.5" />
					<ellipse className="gf-anther" cy={-10} rx={1.1} ry={1.7} />
				</g>
			))}
		</>
	),
	lavender: () => (
		<>
			<path className="gf-stalk" d="M0 20V-21" />
			{Array.from({ length: 9 }, (_, j) => {
				const y = 15 - j * 4.4,
					s = 1 - j * 0.07;
				return (
					<g key={j} transform={`translate(0 ${y}) scale(${s})`}>
						<ellipse className="gf-o gf-petal gf-thin" cx={-2.4} rx={2.1} ry={3.1} transform="rotate(-24 -2.4 0)" />
						<ellipse className="gf-o gf-petal gf-thin" cx={2.4} cy={-1.8} rx={2.1} ry={3.1} transform="rotate(24 2.4 -1.8)" />
					</g>
				);
			})}
		</>
	),
	gypsophila: () => {
		const tips = [
			[-13, -7],
			[-9, -14],
			[-3, -18],
			[4, -16],
			[10, -11],
			[14, -3],
			[-14, 1],
			[-7, -5],
			[1, -9],
			[7, -4],
			[-3, 1],
			[6, 4],
			[-9, 7],
			[12, 6],
		];
		return (
			<>
				{tips.map(([x, y], k) => (
					<path key={k} className="gf-twig" d={`M0 18Q${f(x * 0.3)} ${f(y * 0.3 + 6)} ${x} ${y}`} />
				))}
				{tips.map(([x, y], k) => (
					<circle key={k} className="gf-o gf-petal gf-thin" cx={x} cy={y} r={k % 3 ? 1.9 : 2.4} />
				))}
			</>
		);
	},
	little: () => <use href="#flower" x={-12.5} y={-12.5} width={25} height={25} style={css({ "--petal-line": "var(--night)" })} />,
};

/** One flower head on its own (for pickers and the gallery). */
export function FlowerHead({ f: flower, c, size = "2.4em" }: { f: FlowerId; c: string; size?: string }) {
	return (
		<svg className="gf-flower-icon" viewBox="-22 -24 44 46" style={{ width: size, height: size }} aria-hidden="true">
			<g style={css({ "--c": c, "--petal": c })}>{FLOWER_ART[flower]()}</g>
		</svg>
	);
}

// ---------- the bouquet ----------
const LEAF = "M0 0C5-6 5-14 0-20C-5-14-5-6 0 0Z";
const BACK = "M100 196 L24 72 Q44 34 72 44 Q100 26 128 44 Q156 34 176 72 Z";
const FRONT = "M100 236 L40 116 Q56 126 72 120 Q86 130 100 122 Q114 130 128 120 Q144 126 160 116 Z";
const FOLDS = "M100 232 L72 124 M100 232 L100 126 M100 232 L128 124";
const BOW = "M0 0C-3-6-12-8-12 0S-3 6 0 0ZM0 0C3-6 12-8 12 0S3 6 0 0Z";
const TAILS = "M-1.5 1.5L-7 15L-3.5 13.5L-1.5 16L1 2ZM1.5 1.5L6.5 15.5L3 14L1.2 16.5L-.5 2Z";

export function Ribbon({ x, y, w, color }: { x: number; y: number; w: number; color: string }) {
	return (
		<g className="gf-ribbon" style={css({ "--rb": color })}>
			<rect className="gf-o gf-rb" x={x - w / 2} y={y - 4.5} width={w} height={9} rx={2} />
			<g transform={`translate(${x} ${y})`} key={color} className="gf-bow">
				<path className="gf-o gf-rb" d={TAILS} />
				<path className="gf-o gf-rb" d={BOW} />
				<circle className="gf-o gf-rb" r={3.2} />
			</g>
		</g>
	);
}

function Wrapper({ b, layer }: { b: Bouquet; layer: "back" | "front" }) {
	const d = layer === "back" ? BACK : FRONT;
	return (
		<g className={`gf-wrap gf-wrap-${b.wrap} gf-${layer}`} key={`${b.wrap}${b.wrapColor}`} style={css({ "--wc": b.wrapColor })}>
			{b.wrap === "tissue" && layer === "front" && <path className="gf-o gf-sheet2" d={d} transform="rotate(-5 100 236) translate(-3 -4)" />}
			<path className="gf-o gf-sheet" d={d} />
			{b.wrap === "news" && layer === "front" && (
				<g className="gf-print">
					<rect x={78} y={134} width={44} height={7} />
					{[148, 156, 164, 184, 192].map((y, k) => (
						<path key={y} d={`M${76 + k * 2} ${y}h${48 - k * 4}`} />
					))}
				</g>
			)}
			{b.wrap === "clear" && <path className="gf-shine-streak" d={layer === "back" ? "M44 76 L70 120 M150 70 L136 100" : "M60 128 L84 196 M140 128 L128 160"} />}
			{layer === "front" && b.wrap !== "clear" && <path className="gf-fold" d={FOLDS} />}
		</g>
	);
}

/** A bouquet. `fresh`: stems just added (they spring in); `leaving`: stems on their way out; change `tie` to tie the bow again. */
export function BouquetArt({ b, fresh, leaving, tie = 0, className }: { b: Bouquet; fresh?: ReadonlySet<number>; leaving?: ReadonlySet<number>; tie?: number; className?: string }) {
	const heads = bouquetLayout(b.stems, b.seed);
	const rand = seeded(b.seed + 7);
	// greenery tucked behind the heads (around the dome's upper edge), plus two low sprigs at the paper's rim
	const D = dome(b.stems.length);
	const nLeaves = Math.min(6, 2 + Math.ceil(b.stems.length / 3));
	const leaves = [
		...Array.from({ length: nLeaves }, (_, k) => {
			const a = Math.PI * (1.12 + (k / Math.max(1, nLeaves - 1)) * 0.76) + (rand() - 0.5) * 0.15;
			return { x: f(D.x + Math.cos(a) * (D.rx + 6)), y: f(D.y + Math.sin(a) * (D.ry + 8)), r: f((a * 180) / Math.PI + 90 + (rand() - 0.5) * 16) };
		}),
		{ x: 66, y: 118, r: -58 },
		{ x: 134, y: 118, r: 58 },
	];
	return (
		<svg className={`gf-bouquet${className ? " " + className : ""}`} viewBox="0 0 200 240" aria-hidden="true">
			<Wrapper b={b} layer="back" />
			{leaves.map((l, k) => (
				<g key={k} className="gf-leaf-at" style={{ transform: `translate(${l.x}px, ${l.y}px) rotate(${l.r}deg)` }}>
					<path className="gf-o gf-leaf" d={LEAF} />
					<path className="gf-vein" d="M0 -2V-17" />
				</g>
			))}
			{heads.map((h) => (
				<path
					key={`s${h.i}`}
					className="gf-stem"
					style={{ d: `path("M${h.x} ${h.y + 8} Q${f((h.x + TIE.x) / 2)} ${f((h.y + TIE.y) / 2 + 6)} ${TIE.x} ${TIE.y}")` } as CSSProperties}
				/>
			))}
			{heads.map((h) => {
				const s = b.stems[h.i];
				return (
					<g key={h.i} className="gf-head" style={{ transform: `translate(${h.x}px, ${h.y}px) rotate(${h.r}deg) scale(${h.s})` }}>
						<g className={`gf-sway${fresh?.has(h.i) ? " gf-fresh" : ""}${leaving?.has(h.i) ? " gf-leaving" : ""}`} style={css({ "--c": s.c, "--petal": s.c, animationDelay: `${h.delay}s` })}>
							{FLOWER_ART[s.f]()}
						</g>
					</g>
				);
			})}
			<Wrapper b={b} layer="front" />
			<Ribbon key={tie} x={TIE.x} y={TIE.y} w={66} color={b.ribbon} />
		</svg>
	);
}

// ---------- chocolates ----------
export const FLAVOR_FILL: Record<Choc["flavor"], string> = { dark: "#4a2c22", milk: "#7b4a32", white: "#efe2c8", ruby: "#c95b73", caramel: "#b8763a" };
const DRIZZLE: Record<Choc["flavor"], string> = { dark: "#efe2c8", milk: "#efe2c8", white: "#7b4a32", ruby: "#fff7e6", caramel: "#4a2c22" };

/** One chocolate, drawn around 0,0 with radius r. */
export function Piece({ p, r }: { p: Choc; r: number }) {
	const body =
		p.shape === "round" ? (
			<circle className="gf-o gf-choc" r={r} />
		) : p.shape === "square" ? (
			<rect className="gf-o gf-choc" x={-r * 0.9} y={-r * 0.9} width={r * 1.8} height={r * 1.8} rx={r * 0.3} />
		) : p.shape === "heart" ? (
			<path className="gf-o gf-choc" d={heartPath(r * 2.2, r * 2, -r * 1.1, -r * 0.95)} />
		) : (
			<path className="gf-o gf-choc" d={scallop(r * 0.9, 9, 1.14)} />
		);
	return (
		<g className={`gf-piece-art gf-${p.flavor}`} style={css({ "--choc": FLAVOR_FILL[p.flavor], "--drizzle": DRIZZLE[p.flavor] })}>
			{body}
			{p.shape === "truffle" &&
				ring(7, (deg, k) => <circle key={deg} className="gf-dust" cx={f(Math.cos((deg * Math.PI) / 180) * r * 0.45)} cy={f(Math.sin((deg * Math.PI) / 180) * r * 0.45)} r={k % 2 ? 0.7 : 0.9} />)}
			<path className="gf-choc-shine" d={`M${f(-r * 0.55)} ${f(-r * 0.2)}Q${f(-r * 0.45)} ${f(-r * 0.6)} ${f(-r * 0.05)} ${f(-r * 0.62)}`} />
			{p.top === "drizzle" && <path className="gf-drizzle" d={`M${f(-r * 0.7)} ${f(-r * 0.1)}l${f(r * 0.35)} ${f(-r * 0.3)}l${f(r * 0.35)} ${f(r * 0.45)}l${f(r * 0.35)} ${f(-r * 0.45)}l${f(r * 0.35)} ${f(r * 0.3)}`} />}
			{p.top === "nuts" &&
				[
					[-0.35, -0.2, 20],
					[0.25, -0.35, -30],
					[0.1, 0.2, 60],
				].map(([x, y, a], k) => <path key={k} className="gf-nut" d="M-2 -1.2L1.6 -1.6L2.2 1L-1 1.8Z" transform={`translate(${f(x * r)} ${f(y * r)}) rotate(${a}) scale(${f(r / 11)})`} />)}
			{p.top === "sprinkles" &&
				ring(6, (deg, k) => (
					<path key={deg} className={`gf-sprinkle gf-sp${k % 3}`} d="M-1.3 0H1.3" transform={`rotate(${deg * 1.7}) translate(${f(r * (0.25 + (k % 3) * 0.18))} 0) rotate(${deg})`} />
				))}
			{p.top === "gold" &&
				[
					[-0.3, -0.3],
					[0.3, -0.1],
					[0, 0.3],
					[0.35, 0.35],
				].map(([x, y], k) => <path key={k} className="gf-gold" d="M0 -1.6L1.2 0L0 1.6L-1.2 0Z" transform={`translate(${f(x * r)} ${f(y * r)}) rotate(${k * 25})`} style={{ animationDelay: `${k * 0.7}s` }} />)}
		</g>
	);
}

/** What just changed in the box: those cells (all if none listed) drop in, wave in, or flip. `n` makes each one new. */
export type BoxAnim = { kind: "drop" | "wave" | "flip"; n: number; cells?: number[] } | null;

/** A box of chocolates. `lid`: closed (ribboned lid on), lifting (coming off), open. Taps go to `onCell` (placing) or `onEat`. */
export function ChocolateBox({
	c,
	lid = "open",
	anim,
	onCell,
	cellLabel,
	onEat,
	className,
}: {
	c: Chocolates;
	lid?: "closed" | "lifting" | "open";
	anim?: BoxAnim;
	onCell?: (i: number) => void;
	cellLabel?: (i: number) => string;
	onEat?: (i: number) => void;
	className?: string;
}) {
	const { w, h, cells } = boxLayout(c.size, c.box);
	const clip = useId().replace(/[^\w-]/g, "");
	const [biting, setBiting] = useState<number | null>(null);
	const eaten = new Set(c.eaten ?? []);
	useEffect(() => {
		if (biting === null) return;
		const t = setTimeout(() => {
			onEat?.(biting);
			setBiting(null);
		}, 1100);
		return () => clearTimeout(t);
	}, [biting]);
	const pad = 7;
	const outline = c.box === "heart" ? heartPath(w + pad * 2, h + pad * 2, -pad, -pad) : null;
	const tap = (i: number) => {
		if (onCell) return onCell(i);
		if (onEat && c.pieces[i] && !eaten.has(i) && biting === null) setBiting(i);
	};
	const key = (e: KeyboardEvent, i: number) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), tap(i));
	const clickable = !!onCell || !!onEat;
	return (
		<svg className={`gf-box gf-box-${c.box}${className ? " " + className : ""}`} viewBox={`${-pad - 8} ${-pad - 8} ${w + pad * 2 + 16} ${h + pad * 2 + 16}`} style={css({ "--box": c.boxColor, "--rb": c.ribbon, aspectRatio: `${w + pad * 2 + 16} / ${h + pad * 2 + 16}` })}>
			<defs>
				<clipPath id={`${clip}-lid`}>{outline ? <path d={outline} /> : <rect x={-pad} y={-pad} width={w + pad * 2} height={h + pad * 2} rx={12} />}</clipPath>
			</defs>
			<g className="gf-base">
				{outline ? <path className="gf-o gf-boxfill" d={outline} /> : <rect className="gf-o gf-boxfill" x={-pad} y={-pad} width={w + pad * 2} height={h + pad * 2} rx={12} />}
				{outline ? <path className="gf-tray" d={heartPath(w, h)} /> : <rect className="gf-tray" x={0} y={0} width={w} height={h} rx={7} />}
			</g>
			{cells.map((cell, i) => (
				<Cup key={`cup${i}`} cell={cell} />
			))}
			{cells.map((cell, i) => {
				const p = c.pieces[i];
				const gone = eaten.has(i);
				const moving = !!anim && (!anim.cells || anim.cells.includes(i));
				const k = p ? `${i}-${p.shape}${p.flavor}${p.top}${moving ? `-${anim!.n}` : ""}` : `${i}-empty`;
				const animClass = p && moving && !gone ? ` gf-${anim!.kind}` : "";
				const order = moving && anim!.cells ? anim!.cells.indexOf(i) : i;
				return (
					<g
						key={k}
						className={`gf-cell${clickable ? " gf-tap" : ""}${biting === i ? " gf-biting" : ""}${animClass}`}
						style={{ transform: `translate(${cell.x}px, ${cell.y}px)`, animationDelay: moving && anim!.kind !== "drop" ? `${order * 40}ms` : undefined }}
						role={clickable ? "button" : undefined}
						tabIndex={clickable && (onCell || (p && !gone)) ? 0 : undefined}
						aria-label={clickable ? cellLabel?.(i) : undefined}
						onClick={clickable ? () => tap(i) : undefined}
						onKeyDown={clickable ? (e) => key(e, i) : undefined}
					>
						<circle className="gf-hit" r={cell.r + 2} />
						{p && !gone && (
							<g className="gf-piece">
								<Piece p={p} r={cell.r * 0.78} />
								{biting === i && (
									<>
										<circle className="gf-bite gf-bite1" cx={cell.r * 0.55} cy={-cell.r * 0.5} r={cell.r * 0.38} />
										<circle className="gf-bite gf-bite2" cx={cell.r * 0.7} cy={-cell.r * 0.02} r={cell.r * 0.34} />
										{ring(5, (deg) => (
											<circle key={deg} className="gf-crumb" r={1.1} style={css({ "--dx": `${f(Math.cos((deg * Math.PI) / 180) * 14)}px`, "--dy": `${f(Math.sin((deg * Math.PI) / 180) * 14)}px` })} />
										))}
									</>
								)}
							</g>
						)}
					</g>
				);
			})}
			{lid !== "open" && (
				<g className={`gf-lid${lid === "lifting" ? " gf-lifting" : ""}`}>
					{outline ? <path className="gf-o gf-boxfill gf-lidfill" d={outline} /> : <rect className="gf-o gf-boxfill gf-lidfill" x={-pad} y={-pad} width={w + pad * 2} height={h + pad * 2} rx={12} />}
					<g clipPath={`url(#${clip}-lid)`}>
						<rect className="gf-o gf-rb" x={w / 2 - 6} y={-pad - 2} width={12} height={h + pad * 2 + 4} />
						<rect className="gf-o gf-rb" x={-pad - 2} y={h / 2 - 6} width={w + pad * 2 + 4} height={12} />
					</g>
					<g transform={`translate(${w / 2} ${h / 2}) scale(1.6)`} className="gf-bow">
						<path className="gf-o gf-rb" d={TAILS} />
						<path className="gf-o gf-rb" d={BOW} />
						<circle className="gf-o gf-rb" r={3.2} />
					</g>
				</g>
			)}
		</svg>
	);
}

/** A ruffled paper cup that stays behind when its chocolate is eaten. */
function Cup({ cell }: { cell: Cell }) {
	return (
		<g className="gf-cup-at" style={{ transform: `translate(${cell.x}px, ${cell.y}px)` }}>
			<path className="gf-cup" d={scallop(cell.r, 14, 1.08)} />
			<circle className="gf-cup-in" r={cell.r * 0.8} />
		</g>
	);
}
