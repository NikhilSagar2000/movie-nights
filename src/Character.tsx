import { useState, type CSSProperties, type ReactNode } from "react";
import type { Who } from "../shared/types";

/* The two drawn heads: user "a" is him (glasses + flower), "b" is her (long hair).
   The artwork is the sprite in index.html; styles and every animation are in styles.css (ch-*). */

export const CHAR = { a: "him", b: "her" } as const;

/** Looping states (svg.ch). */
export type Mood = "idle" | "still" | "bob" | "away" | "drowsy" | "hop" | "aww" | "ponder" | "nod" | "dizzy";
/** One-shot moments (.ch-moment). Change `nonce` to play the same one again. */
export type Moment = "arrive" | "leave" | "squish" | "knock" | "happy" | "wiggle" | "bump-l" | "bump-r" | "bow-l" | "bow-r";

const VIEWBOX = { him: "0 0 59.2 61.3", her: "0 0 51.4 78.1" };

export type HeadProps = {
	who: Who;
	mood?: Mood;
	moment?: Moment | null;
	/** Replays `moment` when it changes (the moment layer is re-keyed). */
	nonce?: number;
	/** Her height; his is scaled so both are drawn at the same scale. Any CSS length. */
	h?: string;
	/** Short blush on the cheeks (plays on mount / when `nonce` changes). */
	blush?: boolean;
	/** Glint on his glasses / her starry eyes while idle. */
	twinkle?: boolean;
	/** Hide his flower (it is flying somewhere). */
	flowerGone?: boolean;
	label?: string;
	className?: string;
	style?: CSSProperties;
	onClick?: () => void;
};

export function Head({ who, mood = "idle", moment, nonce = 0, h, blush, twinkle, flowerGone, label, className, style, onClick }: HeadProps) {
	const ch = CHAR[who];
	return (
		<span
			className={`ch-head ch-${ch} ch-${mood}${onClick ? " ch-tap" : ""}${className ? " " + className : ""}`}
			style={h ? ({ "--h": h, ...style } as CSSProperties) : style}
			data-flower={flowerGone ? "gone" : undefined}
			role={label ? "img" : undefined}
			aria-label={label}
			aria-hidden={label ? undefined : true}
			onClick={onClick}
		>
			<span className={`ch-moment${moment ? " " + moment : ""}`} key={`${moment}-${nonce}`}>
				<svg className="ch" viewBox={VIEWBOX[ch]}>
					{ch === "him" ? (
						<>
							<use href="#him-bare" />
							<use className="ch-flower" href="#him-flower" />
						</>
					) : (
						<use href="#her" />
					)}
				</svg>
				{blush && (
					<>
						<i className="ch-x ch-cheek" />
						<i className="ch-x ch-cheek" />
					</>
				)}
			</span>
			{twinkle && mood !== "away" && <i className="ch-x ch-twinkle" />}
			{mood === "away" && (
				<>
					<i className="ch-x ch-z">z</i>
					<i className="ch-x ch-z">z</i>
					<i className="ch-x ch-z">z</i>
				</>
			)}
			{mood === "ponder" && (
				<span className="ch-x ch-dots">
					<b />
					<b />
					<b />
				</span>
			)}
			{mood === "nod" && <span className="ch-x ch-tick">&#10003;</span>}
			{mood === "dizzy" && (
				<span className="ch-x ch-orbit">
					<i />
					<i />
					<i />
				</span>
			)}
			{moment === "knock" && (
				<span className="ch-x ch-sign" key={nonce}>
					<i />
					<i />
				</span>
			)}
		</span>
	);
}

/** Her and him side by side. `together` = they lean in and a flower rises between them. */
export function Duo({ h, together, a, b, children, className }: { h?: string; together?: boolean; a?: Partial<HeadProps>; b?: Partial<HeadProps>; children?: ReactNode; className?: string }) {
	return (
		<span className={`ch-duo${together ? " together" : ""}${className ? " " + className : ""}`} style={h ? ({ "--h": h } as CSSProperties) : undefined}>
			<Head who="b" {...b} />
			<Head who="a" {...a} />
			{together && <Flower className="ch-rise" />}
			{children}
		</span>
	);
}

/** A circle of sky with a head inside. `ring` is their color. */
export function Face({ who, ring, s, rw, className, style, children, ...head }: Omit<HeadProps, "h"> & { ring?: string; s?: string; rw?: string; children?: ReactNode }) {
	return (
		<span className={`face${className ? " " + className : ""}`} style={{ "--ring": ring, "--s": s, "--rw": rw, ...style } as CSSProperties}>
			<Head who={who} {...head} />
			{children}
		</span>
	);
}

/** His flower on its own: the brand mark, reactions, flowers you send, the loader. Color comes from --petal. */
export function Flower({ className, style, label }: { className?: string; style?: CSSProperties; label?: string }) {
	return (
		<svg className={`flw${className ? " " + className : ""}`} style={style} viewBox="0 0 16.3 15.8" role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
			<use href="#flower" />
		</svg>
	);
}

export function Loader({ text }: { text: string }) {
	return (
		<div className="loader" role="status">
			<Flower />
			<span>{text}</span>
		</div>
	);
}

/** Five flowers bursting up from between two heads (Mind Meld "same brain"). Re-key to replay. */
const BURST = [
	[-50, -40],
	[40, -55],
	[0, -70],
	[-30, -75],
	[55, -20],
];
export function FlowerBurst() {
	return (
		<>
			{BURST.map(([x, y], i) => (
				<Flower key={i} className="ch-burst" style={{ "--bx": `${x / 16}em`, "--by": `${y / 16}em` } as CSSProperties} />
			))}
		</>
	);
}

/** Flowers raining down the whole screen (curtain call). Mount it for ~5s to play, then unmount it. */
export function FlowerRain({ count = 16 }: { count?: number }) {
	const [drops] = useState(() =>
		Array.from({ length: count }, (_, i) => ({
			left: `${(i / count) * 96 + Math.random() * 4}%`,
			"--dx": `${Math.round(Math.random() * 60 - 30)}px`,
			"--rot": `${Math.round(Math.random() * 400 - 200)}deg`,
			"--d": `${(Math.random() * 1.2).toFixed(2)}s`,
			"--fall": `${(2.6 + Math.random()).toFixed(2)}s`,
		})),
	);
	return (
		<>
			{drops.map((style, i) => (
				<Flower key={i} className="ch-rain" style={style as CSSProperties} />
			))}
		</>
	);
}

/** After 1 am the idle heads get drowsy. */
export const lateNight = () => {
	const h = new Date().getHours();
	return h >= 1 && h < 5;
};
