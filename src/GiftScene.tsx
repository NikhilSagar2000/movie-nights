// A gift on a little table: the bouquet, the box of chocolates and the note's envelope. The same scene is the builder's
// preview, the send-off (it gathers into a parcel and flies), the parcel that arrives, and its unwrapping.
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { LetterPaper, Who } from "../shared/types";
import type { Gift } from "../shared/gift";
import { BouquetArt, ChocolateBox } from "./giftArt";
import { seeded } from "./giftLayout";
import { Envelope, type Phase as EnvPhase } from "./envelope";

/** preview: laid out · seal: lid on, bows tied · gather: pulled into a parcel · fly: sent off ·
 *  parcel: arrived, waiting for a tap · untie: the big ribbon comes off · spread: laid out again, opening */
export type ScenePhase = "preview" | "seal" | "gather" | "fly" | "parcel" | "untie" | "spread";
const GATHERED: ScenePhase[] = ["gather", "fly", "parcel", "untie"];

export function GiftScene({
	gift,
	note,
	phase,
	env,
	lid,
	tieKey = 0,
	onTap,
	button = !!onTap,
	label,
}: {
	gift?: Gift;
	/** The envelope, when there's a note. */
	note?: { paper: LetterPaper; from: Who; to: string } | null;
	phase: ScenePhase;
	env?: EnvPhase;
	lid?: "closing" | "closed" | "lifting" | "open";
	/** Change it to tie the bouquet's bow again. */
	tieKey?: number;
	onTap?: () => void;
	/** Keep it a button even while it can't be tapped: swapping the element would restart every entrance animation. */
	button?: boolean;
	label?: string;
}) {
	const parts = `${gift?.bouquet ? "b" : ""}${gift?.chocolates ? "c" : ""}${note ? "n" : ""}` || "n";
	const gathered = GATHERED.includes(phase);
	const boxLid = lid ?? (gathered || phase === "seal" ? "closed" : "open");
	const body = (
		<>
			<div className="gs-group">
				{gift?.bouquet && (
					<div className="gs-item gs-bouquet">
						<BouquetArt b={gift.bouquet} tie={tieKey} />
					</div>
				)}
				{gift?.chocolates && (
					<div className="gs-item gs-box">
						<ChocolateBox c={gift.chocolates} lid={boxLid === "closing" ? "closed" : boxLid} className={boxLid === "closing" ? "gf-closing" : undefined} />
					</div>
				)}
				{note && (
					<div className="gs-item gs-note">
						<Envelope phase={env ?? (gathered || phase === "seal" ? "closed" : "closed")} paper={note.paper} from={note.from} to={note.to} />
					</div>
				)}
				{gathered && parts.length > 1 && <ParcelRibbon color={gift?.bouquet?.ribbon ?? gift?.chocolates?.ribbon ?? "#b46a72"} />}
			</div>
			{phase === "fly" && <Petals kind="trail" />}
			{phase === "spread" && <Petals kind="fall" />}
			{phase === "parcel" && <Sparkles />}
		</>
	);
	const props = { className: "gs-scene", "data-phase": phase, "data-parts": parts };
	return button ? (
		<button type="button" {...props} aria-label={label} aria-hidden={label ? undefined : true} disabled={!onTap} onClick={onTap}>
			{body}
		</button>
	) : (
		<div {...props} aria-hidden={label ? undefined : true} role={label ? "img" : undefined} aria-label={label}>
			{body}
		</div>
	);
}

/** The ribbon that ties the gifts into one parcel: a band wrapped round the middle of the bundle (its ends curling
 *  out of sight), a big bow at the front and two notched tails. */
function ParcelRibbon({ color }: { color: string }) {
	return (
		<div className="gs-tie" aria-hidden="true" style={{ "--rb": color } as CSSProperties}>
			{/* the band stretches to the bundle's width; the bow keeps its shape */}
			<svg className="gs-band" viewBox="0 0 200 30" preserveAspectRatio="none">
				<ellipse className="gs-band-end" cx={5} cy={15} rx={4} ry={9} />
				<ellipse className="gs-band-end" cx={195} cy={15} rx={4} ry={9} />
				<path className="gs-band-front" d="M5 7Q100 16 195 7L195 23Q100 32 5 23Z" />
				<path className="gs-band-shine" d="M10 10.5Q100 19 190 10.5" />
			</svg>
			<svg className="gs-bow-at" viewBox="64 14 72 52">
				<g className="gs-tails">
					<path className="gs-rb" d="M97 36L84 60L90.5 57L92 64L101 37Z" />
					<path className="gs-rb" d="M103 36L118 59L111.5 57.5L110.5 64.5L99 37Z" />
				</g>
				<path className="gs-rb" d="M100 34C94 22 72 16 70 30C68 44 92 42 100 34Z" />
				<path className="gs-rb" d="M100 34C106 22 128 16 130 30C132 44 108 42 100 34Z" />
				<path className="gs-loop-in" d="M97 33C92 27 80 24 78 30C77 36 90 37 97 33ZM103 33C108 27 120 24 122 30C123 36 110 37 103 33Z" />
				<ellipse className="gs-rb" cx={100} cy={34} rx={6} ry={5.5} />
			</svg>
		</div>
	);
}

/** Petals drifting: a trail behind a parcel that's flying off, or a few falling while a gift opens. */
export function Petals({ kind, n = 14 }: { kind: "trail" | "fall"; n?: number }) {
	const petals = useMemo(() => {
		const r = seeded(kind === "trail" ? 3 : 8);
		return Array.from({ length: n }, (_, k) => ({
			x: Math.round(r() * 100),
			d: Math.round(r() * 900),
			s: 0.6 + r() * 0.8,
			c: ["#f7c8d3", "#f4a3b4", "#f7dd8d", "#fff7e6"][k % 4],
			dx: Math.round((r() - 0.5) * 120),
			spin: Math.round(r() * 540 - 270),
		}));
	}, [kind, n]);
	return (
		<div className={`gs-petals gs-${kind}`} aria-hidden="true">
			{petals.map((p, k) => (
				<i key={k} style={{ "--x": `${p.x}%`, "--d": `${p.d}ms`, "--s": p.s, "--c": p.c, "--dx": `${p.dx}px`, "--spin": `${p.spin}deg` } as CSSProperties} />
			))}
		</div>
	);
}

function Sparkles() {
	return (
		<div className="gs-sparkles" aria-hidden="true">
			{[
				[18, 30, 0],
				[80, 22, 250],
				[70, 70, 500],
				[26, 72, 750],
				[50, 12, 380],
			].map(([x, y, d], k) => (
				<i key={k} style={{ "--x": `${x}%`, "--y": `${y}%`, "--d": `${d}ms` } as CSSProperties} />
			))}
		</div>
	);
}

/** Runs a timed sequence of steps; restarts when `run` changes. Reduced motion jumps to the last step. */
export function useSteps<T>(steps: [T, number][], run: unknown, reduced: boolean): T | null {
	const [step, setStep] = useState<T | null>(null);
	useEffect(() => {
		if (!run) return setStep(null);
		if (reduced) return setStep(steps.at(-1)![0]);
		const timers = steps.map(([s, ms]) => setTimeout(() => setStep(s), ms));
		return () => timers.forEach(clearTimeout);
	}, [run]);
	return step;
}
