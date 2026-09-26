import type { CSSProperties } from "react";

export type Mood = "idle" | "wave" | "sleep" | "love" | "cheer" | "peek" | "cover" | "popcorn" | "sad" | "think";

export type TeddyProps = {
	mood?: Mood;
	size?: number;
	/** Bow/scarf color — each person's profile color. */
	accent?: string;
	className?: string;
	/** Accessible label; decorative (aria-hidden) when omitted. */
	label?: string;
};

/*
 * A hand-drawn SVG teddy. Poses live in the teddy section of styles.css: each mood sets a few CSS variables
 * (arm angles, body offset, head tilt) that transition, plus looping keyframes on inner groups.
 * Coordinates: viewBox 0 0 200 240, shoulders at (62,148) and (138,148), neck at (100,140).
 */

const HEART = "M0 7C-10 0-10-8-5-8C-2-8 0-6 0-4C0-6 2-8 5-8C10-8 10 0 0 7Z";
const SPARK = "M0-9Q1.6-1.6 9 0Q1.6 1.6 0 9Q-1.6 1.6-9 0Q-1.6-1.6 0-9Z";

function Eyes({ mood }: { mood: Mood }) {
	if (mood === "sleep") return <path className="teddy-stroke" d="M73 89Q80 95 87 89M113 89Q120 95 127 89" />;
	if (mood === "cheer") return <path className="teddy-stroke" d="M73 91Q80 82 87 91M113 91Q120 82 127 91" />;
	if (mood === "love")
		return (
			<>
				{[80, 120].map((x) => (
					<g key={x} transform={`translate(${x} 89) scale(.8)`}>
						<path className="teddy-hearteye" d={HEART} />
					</g>
				))}
			</>
		);
	if (mood === "sad")
		return (
			<>
				<path className="teddy-stroke" d="M71 79L86 74M114 74L129 79" />
				<path className="teddy-ink" d="M73.5 87a6.5 6.5 0 0 0 13 0ZM113.5 87a6.5 6.5 0 0 0 13 0Z" />
				<circle className="teddy-shine" cx="82" cy="89.5" r="1.7" />
				<circle className="teddy-shine" cx="122" cy="89.5" r="1.7" />
			</>
		);
	return (
		<g className="teddy-eyes">
			{[80, 120].map((x) => (
				<g key={x} className="teddy-eye">
					<circle className="teddy-ink" cx={x} cy="88" r="6.5" />
					<circle className="teddy-shine" cx={x + 2.2} cy="85.6" r="2.2" />
				</g>
			))}
		</g>
	);
}

function Mouth({ mood }: { mood: Mood }) {
	switch (mood) {
		case "cheer":
		case "wave":
			return <path className="teddy-ink teddy-open" d="M90 113Q100 128 110 113Z" />;
		case "sleep":
			return <path className="teddy-stroke" d="M96 116Q100 118.5 104 116" />;
		case "popcorn":
			return <ellipse className="teddy-ink teddy-munch" cx="100" cy="116" rx="5" ry="3.6" />;
		case "sad":
			return <path className="teddy-stroke" d="M92 119Q100 112 108 119" />;
		case "think":
			return <path className="teddy-stroke" d="M94 117Q98 114 101 116T108 115" />;
		default:
			return <path className="teddy-stroke" d="M100 109v4M92 113Q96 118.5 100 113Q104 118.5 108 113" />;
	}
}

function Arm({ side, x, kernel }: { side: "l" | "r"; x: number; kernel?: boolean }) {
	return (
		<g className={`teddy-arm teddy-arm-${side}`}>
			<g className="teddy-arm-in">
				<rect className="teddy-fur" x={x - 12} y="136" width="24" height="56" rx="12" />
				<ellipse className="teddy-light" cx={x} cy="181" rx="7.5" ry="6.5" />
				{kernel && <circle className="teddy-puff" cx={x} cy="191" r="6.5" />}
			</g>
		</g>
	);
}

// Striped popcorn bucket: the stripes are slices of the trapezoid (no clipPath, so no ids to collide).
const TOP = [71, 82.6, 94.2, 105.8, 117.4, 129];
const BOT = [78, 86.8, 95.6, 104.4, 113.2, 122];
const PUFFS = [
	[80, 168, 8],
	[92, 163, 9],
	[105, 164, 9],
	[118, 168, 8],
	[86, 160, 6],
	[99, 157, 6],
	[112, 160, 6],
];

function Bucket() {
	return (
		<g>
			{PUFFS.map(([cx, cy, r]) => (
				<circle key={cx} className="teddy-puff" cx={cx} cy={cy} r={r} />
			))}
			{TOP.slice(0, 5).map((x, i) => (
				<path key={x} className={i % 2 ? "teddy-stripe-w" : "teddy-stripe"} d={`M${x} 175L${TOP[i + 1]} 175L${BOT[i + 1]} 220L${BOT[i]} 220Z`} />
			))}
			<path className="teddy-bucket-line" d="M71 175L129 175L122 220L78 220Z" />
			<rect className="teddy-rim" x="67" y="170" width="66" height="10" rx="5" />
		</g>
	);
}

function Fx({ mood }: { mood: Mood }) {
	if (mood === "sleep")
		return (
			<g>
				{[
					[166, 48, 13],
					[178, 32, 16],
					[189, 16, 19],
				].map(([x, y, s], i) => (
					<text key={x} className="teddy-type teddy-z" x={x} y={y} fontSize={s} textAnchor="middle" style={{ animationDelay: `${-i}s` }}>
						z
					</text>
				))}
			</g>
		);
	if (mood === "love")
		return (
			<g>
				{[
					[34, 118],
					[168, 104],
					[46, 62],
					[158, 52],
				].map(([x, y], i) => (
					<g key={x} transform={`translate(${x} ${y})`}>
						<path className="teddy-heart" d={HEART} style={{ animationDelay: `${-i * 0.75}s` }} />
					</g>
				))}
			</g>
		);
	if (mood === "cheer")
		return (
			<g>
				{[
					[28, 62],
					[174, 70],
					[18, 142],
					[184, 134],
				].map(([x, y], i) => (
					<g key={x} transform={`translate(${x} ${y})`}>
						<path className={i % 2 ? "teddy-spark teddy-spark-hot" : "teddy-spark"} d={SPARK} style={{ animationDelay: `${-i * 0.35}s` }} />
					</g>
				))}
			</g>
		);
	if (mood === "think")
		return (
			<g className="teddy-bubble">
				<circle className="teddy-cloud" cx="148" cy="62" r="4" />
				<circle className="teddy-cloud" cx="157" cy="50" r="6" />
				<circle className="teddy-cloud" cx="174" cy="28" r="20" />
				<text className="teddy-type teddy-q" x="174" y="37" fontSize="26" textAnchor="middle">
					?
				</text>
			</g>
		);
	return null;
}

export default function Teddy({ mood = "idle", size = 120, accent, className, label }: TeddyProps) {
	const style = accent ? ({ "--teddy-accent": accent } as CSSProperties) : undefined;
	return (
		<svg
			className={`teddy teddy--${mood}${className ? ` ${className}` : ""}`}
			viewBox="0 0 200 240"
			width={size}
			height={size * 1.2}
			style={style}
			role={label ? "img" : undefined}
			aria-hidden={label ? undefined : true}
			focusable="false"
		>
			{label && <title>{label}</title>}
			<g className="teddy-pose">
				<g className="teddy-bob">
					<ellipse className="teddy-fur" cx="100" cy="170" rx="50" ry="44" />
					<ellipse className="teddy-light" cx="100" cy="178" rx="30" ry="28" />
					{[68, 132].map((x) => (
						<g key={x}>
							<ellipse className="teddy-fur" cx={x} cy="206" rx="22" ry="18" />
							<ellipse className="teddy-light" cx={x} cy="209" rx="12" ry="10" />
						</g>
					))}
					<g className="teddy-head">
						<g className="teddy-head-in">
							{[60, 140].map((x) => (
								<g key={x}>
									<circle className="teddy-fur" cx={x} cy="52" r="21" />
									<circle className="teddy-light" cx={x} cy="53" r="11" />
								</g>
							))}
							<circle className="teddy-fur" cx="100" cy="92" r="52" />
							<ellipse className="teddy-cheek" cx="70" cy="106" rx="9" ry="6" />
							<ellipse className="teddy-cheek" cx="130" cy="106" rx="9" ry="6" />
							<ellipse className="teddy-light" cx="100" cy="110" rx="23" ry="17" />
							<Eyes mood={mood} />
							<path className="teddy-ink" d="M92 101Q100 96 108 101Q106 108 100 109Q94 108 92 101Z" />
							<Mouth mood={mood} />
							{mood === "sad" && <path className="teddy-tear" d="M77 95Q72 103 77 106Q82 103 77 95Z" />}
						</g>
					</g>
					<g className="teddy-bow">
						<path d="M100 145C90 132 74 134 76 145C74 156 90 158 100 145Z" />
						<path d="M100 145C110 132 126 134 124 145C126 156 110 158 100 145Z" />
						<circle cx="100" cy="145" r="6" />
					</g>
					{mood === "popcorn" && <Bucket />}
					<Arm side="l" x={62} />
					<Arm side="r" x={138} kernel={mood === "popcorn"} />
				</g>
				<Fx mood={mood} />
			</g>
		</svg>
	);
}
