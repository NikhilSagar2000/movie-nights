// Our little tuberose (rajnigandha): it grows as the two of you spend time here together. The Room hands out the
// points (capped per day, only while you're both here); this draws the plant for them. It only ever grows.
import { useEffect, useRef, useState, type CSSProperties } from "react";

/** Points needed for each stage. ponytail: tune after a few weeks of real use. */
export const STAGES = [
	[0, "Just planted"],
	[4, "A sprout"],
	[10, "Leaves"],
	[20, "A stalk"],
	[35, "Buds"],
	[55, "The first flowers"],
	[80, "Half in bloom"],
	[110, "In full bloom"],
	[160, "A second stalk"],
	[230, "A little garden"],
] as const;
export const stageOf = (pts: number) => STAGES.reduce((s, [min], i) => (pts >= min ? i : s), 0);

// Main spike: floret pairs from the bottom up; they open in that order, like a real tuberose.
const PAIRS = [98, 88, 78, 68, 58, 48];
const OPEN_AT = [5, 6, 6, 7, 7, 99]; // the stage each pair opens at (the top one stays in bud)

export function Tuberose({ pts, onGrow }: { pts: number; onGrow?: () => void }) {
	const stage = stageOf(pts);
	const [next, nextName] = STAGES[stage + 1] ?? [];
	const was = useRef(stage);
	const [grew, setGrew] = useState(false);
	useEffect(() => {
		if (stage <= was.current) return void (was.current = stage);
		was.current = stage;
		setGrew(true);
		onGrow?.();
		const t = setTimeout(() => setGrew(false), 2600);
		return () => clearTimeout(t);
	}, [stage]);
	const toNext = next === undefined ? 1 : (pts - STAGES[stage][0]) / (next - STAGES[stage][0]);

	return (
		<div className="tr-wrap">
			<button className="tr-btn" popoverTarget="tr-info" aria-label={`Our tuberose: ${STAGES[stage][1].toLowerCase()}`}>
				<svg className="tr" viewBox="0 0 120 210" data-grew={grew ? stage : undefined} aria-hidden="true">
					<defs>
						<linearGradient id="tr-bud" x1="0" y1="1" x2="0" y2="0">
							<stop offset="0.35" stopColor="var(--cream)" />
							<stop offset="1" stopColor="var(--blush)" />
						</linearGradient>
					</defs>
					{stage >= 5 && (
						<g className="tr-scent">
							<path d="M76 74 q7 -6 0 -12 q-7 -6 0 -12" />
							<path d="M44 64 q-6 -5 0 -10 q6 -5 0 -10" />
						</g>
					)}
					{stage >= 9 && <Spike x={78} base={64} top={70} pairs={[106, 96, 86]} open={2} s={9} />}
					{stage >= 8 && <Spike x={42} base={57} top={62} pairs={[104, 94, 84, 74]} open={stage >= 9 ? 3 : 2} s={8} />}
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
					{stage >= 3 && (
						<g className="tr-part" data-s={stage >= 4 ? 4 : 3}>
							<Stem d={`M60 152 C61 124 59 ${stage >= 4 ? 80 : 124} 60 ${stage >= 4 ? 38 : 104}`} />
						</g>
					)}
					{stage >= 4 && (
						<>
							{PAIRS.map((y, i) => {
								const open = stage >= OPEN_AT[i];
								return (
									<g key={y} className="tr-part" data-s={open ? OPEN_AT[i] : 4}>
										<Floret x={54} y={y} open={open} lean={-1} />
										<Floret x={66} y={y - 4} open={open} lean={1} />
									</g>
								);
							})}
							<g className="tr-part" data-s="4">
								<Floret x={57} y={40} open={false} lean={-1} small />
								<Floret x={63} y={37} open={false} lean={1} small />
								<Floret x={60} y={33} open={false} lean={0} small />
							</g>
						</>
					)}
					<path className="tr-pot" d="M29 158 L91 158 L84 204 Q60 208 36 204 Z" />
					<rect className="tr-rim" x="24" y="149" width="72" height="12" rx="4" />
					<path className="tr-soil" d="M31 150 Q60 141 89 150 Z" />
				</svg>
				{grew && <span className="tr-grew">It grew!</span>}
			</button>
			<div id="tr-info" popover="auto" className="tr-info">
				<p className="tr-info-title">Our tuberose</p>
				<p className="tr-info-stage">{STAGES[stage][1]}</p>
				<p>It grows when you spend time here together: being here on the same day, movie nights, games, notes and videos.</p>
				{nextName ? (
					<>
						<span className="tr-meter" style={{ "--p": toNext } as CSSProperties} aria-hidden="true" />
						<p className="tr-next">Next: {nextName.toLowerCase()}</p>
					</>
				) : (
					<p className="tr-next">It's a whole little garden now.</p>
				)}
			</div>
		</div>
	);
}

/** A stem: an ink outline under a sage core, like the rest of the drawing. */
const Stem = ({ d }: { d: string }) => (
	<>
		<path className="tr-stem" d={d} />
		<path className="tr-stem-in" d={d} />
	</>
);

/** A side stalk: stem from the soil to `top`, floret pairs, the lowest `open` of them in flower. */
function Spike({ x, base, top, pairs, open, s }: { x: number; base: number; top: number; pairs: number[]; open: number; s: number }) {
	return (
		<g className="tr-part" data-s={s}>
			<Stem d={`M${base} 152 C${base} 128 ${x} ${top + 30} ${x} ${top}`} />
			{pairs.map((y, i) => (
				<g key={y}>
					<Floret x={x - 5} y={y} open={i < open} lean={-1} />
					<Floret x={x + 5} y={y - 3} open={i < open} lean={1} />
				</g>
			))}
			<Floret x={x} y={top - 2} open={false} lean={0} small />
		</g>
	);
}

/** A waxy white star of six petals, or a long blush-tipped bud leaning out from the stem. */
function Floret({ x, y, open, lean, small }: { x: number; y: number; open: boolean; lean: number; small?: boolean }) {
	if (!open) return <ellipse className="tr-bud" cx={x} cy={y} rx={small ? 1.8 : 2.2} ry={small ? 3.8 : 4.8} transform={`rotate(${lean * 28} ${x} ${y})`} />;
	return (
		<g className="tr-flower" transform={`translate(${x} ${y}) rotate(${lean * 15})`}>
			{[0, 60, 120, 180, 240, 300].map((a) => (
				<ellipse key={a} cx="0" cy="-3.2" rx="1.9" ry="3.3" transform={`rotate(${a})`} />
			))}
			<circle r="1.3" className="tr-eye" />
		</g>
	);
}
