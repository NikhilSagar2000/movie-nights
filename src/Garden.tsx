// Our little garden on the window sill: a pot of tuberoses (rajnigandha) and a pot of tulips. Both grow from the same points,
// which the Room hands out for time spent here together (capped per day, only while you're both here). They only
// ever grow. Each plant has its own stages, so they don't grow in step.
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

type Stages = readonly (readonly [number, string])[];
/** Points needed for each stage. ponytail: tune after a few weeks of real use. */
export const TUBEROSE: Stages = [
	[0, "Just planted"],
	[4, "A sprout"],
	[10, "Leaves"],
	[20, "Three stalks"],
	[35, "Buds"],
	[55, "The first flowers"],
	[80, "Pink ones too"],
	[110, "In full bloom"],
	[160, "A fourth stalk"],
	[230, "A pot full of tuberoses"],
];
export const TULIPS: Stages = [
	[0, "Just planted"],
	[3, "Sprouts"],
	[8, "Leaves"],
	[16, "Stems"],
	[28, "Buds"],
	[45, "The first tulip"],
	[65, "Two tulips"],
	[95, "Three tulips"],
	[135, "Four tulips"],
	[195, "A pot full of tulips"],
];
export const stageOf = (stages: Stages, pts: number) => stages.reduce((s, [min], i) => (pts >= min ? i : s), 0);

export function Garden({ pts, onGrow }: { pts: number; onGrow?: () => void }) {
	return (
		<>
			<Plant kind="tuberose" name="Our tuberoses" stages={TUBEROSE} pts={pts} onGrow={onGrow} done="Every stalk is in bloom." art={(s) => <TuberoseArt stage={s} />} />
			<Plant kind="tulips" name="Our tulips" stages={TULIPS} pts={pts} onGrow={onGrow} done="Every colour is out." art={(s) => <TulipArt stage={s} />} />
		</>
	);
}

/** One pot: the drawing as a button, "It grew!" when it moves up a stage, and a little card with its progress. */
function Plant(props: { kind: string; name: string; stages: Stages; pts: number; done: string; art: (stage: number) => ReactNode; onGrow?: () => void }) {
	const { kind, name, stages, pts } = props;
	const stage = stageOf(stages, pts);
	const [next, nextName] = stages[stage + 1] ?? [];
	const was = useRef(stage);
	const [grew, setGrew] = useState(false);
	useEffect(() => {
		if (stage <= was.current) return void (was.current = stage);
		was.current = stage;
		setGrew(true);
		props.onGrow?.();
		const t = setTimeout(() => setGrew(false), 2600);
		return () => clearTimeout(t);
	}, [stage]);
	const toNext = next === undefined ? 1 : (pts - stages[stage][0]) / (next - stages[stage][0]);
	const anchor = `--garden-${kind}`;

	return (
		<div className={`tr-wrap ${kind}`}>
			<button className="tr-btn" popoverTarget={`garden-${kind}`} style={{ anchorName: anchor } as CSSProperties} aria-label={`${name}: ${stages[stage][1].toLowerCase()}`}>
				<svg className={`tr ${kind}`} viewBox="0 0 120 210" data-grew={grew ? stage : undefined} aria-hidden="true">
					{props.art(stage)}
				</svg>
				{grew && <span className="tr-grew">It grew!</span>}
			</button>
			<div id={`garden-${kind}`} popover="auto" className="tr-info" style={{ positionAnchor: anchor } as CSSProperties}>
				<p className="tr-info-title">{name}</p>
				<p className="tr-info-stage">{stages[stage][1]}</p>
				<p>The tuberoses and the tulips grow when you spend time here together: being here on the same day, movie nights, games, notes and videos.</p>
				{nextName ? (
					<>
						<span className="tr-meter" style={{ "--p": toNext } as CSSProperties} aria-hidden="true" />
						<p className="tr-next">Next: {nextName.toLowerCase()}</p>
					</>
				) : (
					<p className="tr-next">{props.done}</p>
				)}
			</div>
		</div>
	);
}

/** The pot both plants sit in (the tulips' is slate blue, the tuberose's rosewood). */
const Pot = () => (
	<>
		<path className="tr-pot" d="M29 158 L91 158 L84 204 Q60 208 36 204 Z" />
		<rect className="tr-rim" x="24" y="149" width="72" height="12" rx="4" />
		<path className="tr-soil" d="M31 150 Q60 141 89 150 Z" />
	</>
);

/** A stem: an ink outline under a sage core, like the rest of the drawing. */
const Stem = ({ d }: { d: string }) => (
	<>
		<path className="tr-stem" d={d} />
		<path className="tr-stem-in" d={d} />
	</>
);

// ================= the tuberose =================
// Five stalks, white and soft pink (pink tuberoses exist, just rarer). The first three rise together; each blooms
// from the bottom up, like a real tuberose, and two more stalks join later. The top buds stay closed.
type Stalk = { x: number; base: number; top: number; pink?: boolean; from: number; openAt: number[] };
const STALKS: Stalk[] = [
	{ x: 32, base: 54, top: 82, from: 8, openAt: [8, 9, 9] }, // back row first
	{ x: 88, base: 66, top: 86, pink: true, from: 9, openAt: [9, 9, 99] },
	{ x: 44, base: 57, top: 58, pink: true, from: 3, openAt: [6, 7, 7, 8] },
	{ x: 76, base: 63, top: 62, from: 3, openAt: [7, 7, 8, 9] },
	{ x: 60, base: 60, top: 38, from: 3, openAt: [5, 5, 6, 6, 7, 7] },
];

function TuberoseArt({ stage }: { stage: number }) {
	return (
		<>
			<defs>
				<linearGradient id="tr-bud" x1="0" y1="1" x2="0" y2="0">
					<stop offset="0.35" stopColor="var(--cream)" />
					<stop offset="1" stopColor="var(--blush)" />
				</linearGradient>
				<linearGradient id="tr-bud-pink" x1="0" y1="1" x2="0" y2="0">
					<stop offset="0.3" stopColor="var(--blush)" />
					<stop offset="1" stopColor="var(--rosewood)" />
				</linearGradient>
			</defs>
			{stage >= 5 && (
				<g className="tr-scent">
					<path d="M76 70 q7 -6 0 -12 q-7 -6 0 -12" />
					<path d="M44 56 q-6 -5 0 -10 q6 -5 0 -10" />
				</g>
			)}
			{STALKS.filter((k) => stage >= k.from).map((k) => (
				<Spike key={k.x} stalk={k} stage={stage} />
			))}
			{stage >= 2 && (
				<g className="tr-part tr-leaf" data-s="2">
					<path d="M58 152 C49 119 35 103 22 95 C39 106 52 124 54 152 Z" />
					<path d="M62 152 C73 117 87 105 99 99 C85 112 73 127 66 152 Z" />
					<path d="M59 152 C55 127 49 112 41 104 C52 115 57 131 62 152 Z" />
					<path d="M61 152 C66 130 73 118 82 112 C73 122 67 136 64 152 Z" />
				</g>
			)}
			{stage === 1 && (
				<g className="tr-part tr-leaf" data-s="1">
					<path d="M60 152 L60 142" className="tr-line" />
					<path d="M60 146 C56 140 51 137 46 137 C51 141 56 144 60 147 Z" />
					<path d="M60 144 C64 138 69 135 74 135 C69 139 64 142 60 145 Z" />
				</g>
			)}
			<Pot />
		</>
	);
}

/** One stalk: short at first, then full height with floret pairs that open bottom-up; a few buds at the tip. */
function Spike({ stalk: k, stage }: { stalk: Stalk; stage: number }) {
	const grown = stage >= Math.max(4, k.from);
	const top = grown ? k.top : 152 - (152 - k.top) * 0.45;
	const n = k.openAt.length;
	return (
		<g className="tr-part" data-s={grown ? Math.max(4, k.from) : k.from}>
			<Stem d={`M${k.base} 152 C${k.base} 128 ${k.x} ${top + 30} ${k.x} ${top}`} />
			{grown && (
				<>
					{k.openAt.map((at, i) => {
						const y = k.top + 10 + (n - 1 - i) * 10; // bottom pair first
						const open = stage >= at;
						return (
							<g key={i} className="tr-part" data-s={open ? at : Math.max(4, k.from)}>
								<Floret x={k.x - 6} y={y} open={open} lean={-1} pink={k.pink} />
								<Floret x={k.x + 6} y={y - 4} open={open} lean={1} pink={k.pink} />
							</g>
						);
					})}
					<Floret x={k.x - 3} y={k.top + 2} open={false} lean={-1} pink={k.pink} small />
					<Floret x={k.x + 3} y={k.top - 1} open={false} lean={1} pink={k.pink} small />
					<Floret x={k.x} y={k.top - 5} open={false} lean={0} pink={k.pink} small />
				</>
			)}
		</g>
	);
}

/** A waxy star of six petals (white or soft pink), or a long bud leaning out from the stem. */
function Floret({ x, y, open, lean, small, pink }: { x: number; y: number; open: boolean; lean: number; small?: boolean; pink?: boolean }) {
	if (!open)
		return (
			<ellipse
				className={`tr-bud${pink ? " pink" : ""}`}
				cx={x}
				cy={y}
				rx={small ? 1.8 : 2.2}
				ry={small ? 3.8 : 4.8}
				transform={`rotate(${lean * 28} ${x} ${y})`}
			/>
		);
	return (
		<g className={`tr-flower${pink ? " pink" : ""}`} transform={`translate(${x} ${y}) rotate(${lean * 15})`}>
			{[0, 60, 120, 180, 240, 300].map((a) => (
				<ellipse key={a} cx="0" cy="-3.2" rx="1.9" ry="3.3" transform={`rotate(${a})`} />
			))}
			<circle r="1.3" className="tr-eye" />
		</g>
	);
}

// ================= the tulips =================
// Five stems, each its own colour; they open one by one. Petal colours are drawing data, like doodle inks,
// not UI tokens (a red and a lilac tulip have no place in the interface palette). Back row first.
const TULIP_HEADS = [
	{ x: 53, top: 92, lean: -5, petal: "#b9a3dc", open: 8 }, // lilac
	{ x: 68, top: 96, lean: 6, petal: "#fff7e6", open: 9 }, // white
	{ x: 46, top: 74, lean: -9, petal: "#f7dd8d", open: 6 }, // yellow
	{ x: 74, top: 70, lean: 8, petal: "#e2685f", open: 7 }, // red
	{ x: 60, top: 60, lean: 0, petal: "#f4b3c2", open: 5 }, // pink
];

function TulipArt({ stage }: { stage: number }) {
	return (
		<>
			{stage >= 3 &&
				TULIP_HEADS.map((t) => (
					<g key={t.x} className="tr-part" data-s={stage >= t.open ? t.open : stage >= 4 ? 4 : 3}>
						<Stem d={`M${60 + (t.x - 60) * 0.35} 150 C${60 + (t.x - 60) * 0.4} 130 ${t.x} ${t.top + 25} ${t.x} ${t.top}`} />
						<Tulip x={t.x} y={t.top} lean={t.lean} petal={stage >= 4 ? t.petal : undefined} open={stage >= t.open} />
					</g>
				))}
			{stage >= 2 && (
				<g className="tr-part tr-leaf" data-s="2">
					<path d="M58 150 C46 144 36 136 27 127 C40 131 50 138 60 147 Z" />
					<path d="M62 150 C74 143 84 136 93 129 C80 133 70 139 60 147 Z" />
					<path d="M56 150 C41 136 33 117 35 94 C43 111 52 127 60 148 Z" />
					<path d="M64 150 C79 135 87 116 85 95 C77 113 68 128 60 148 Z" />
				</g>
			)}
			{stage === 1 && (
				<g className="tr-part tr-leaf" data-s="1">
					<path d="M51 150 L54 139 L57 150 Z" />
					<path d="M58 150 L61 136 L64 150 Z" />
					<path d="M65 150 L68 140 L71 150 Z" />
				</g>
			)}
			<Pot />
		</>
	);
}

/** A tulip head: a cup of petals once open, a closed bud before (green until it colours up). */
function Tulip({ x, y, lean, petal, open }: { x: number; y: number; lean: number; petal?: string; open: boolean }) {
	const fill = petal ?? "var(--sage)";
	return (
		<g className="tr-tulip" transform={`translate(${x} ${y}) rotate(${lean}) scale(1.25)`} style={{ fill }}>
			{open ? (
				<>
					<path d="M-7.5 -4 C-8.5 -10 -6.5 -15 -4.5 -17.5 C-3.5 -13.5 -2 -12.5 0 -18.5 C2 -12.5 3.5 -13.5 4.5 -17.5 C6.5 -15 8.5 -10 7.5 -4 C6.5 1.5 -6.5 1.5 -7.5 -4 Z" />
					<path className="tr-crease" d="M0 -18 C-1.2 -12 -1.2 -6 0 -1" />
				</>
			) : (
				<path d="M-4 -2.5 C-5 -8.5 -2.5 -14 0 -16.5 C2.5 -14 5 -8.5 4 -2.5 C3 0.5 -3 0.5 -4 -2.5 Z" />
			)}
		</g>
	);
}
