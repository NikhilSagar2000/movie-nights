import { useReducer, useRef } from "react";
import { Flower, Head, type Moment } from "../Character";
import { cls } from "../games/lead";
import { useKeys, useLoop, type SoloApi } from "./kit";
import { hit, LIVES, newSwat, step, type Fx, type Swat as S } from "./logic/swat";
import "./swat.css";
import { sfx } from "./sound";

/* Mosquito Swat: nine lit windows on a building at dusk. Mosquitoes pop up in them for a moment: swat them before
   they bite. Now and then it's a tuberose in a pot instead: leave that one be. Three bites (or bopped flowers) and
   the mosquitoes win. A DOM game: the windows are buttons, and React only redraws when something comes or goes. */

const PAD = ["7", "8", "9", "4", "5", "6", "1", "2", "3"]; // the number-pad key for each spot, top row first
const FACE: Partial<Record<Fx["kind"], Moment>> = { zap: "happy", bite: "squish", oops: "wiggle" };

export default function Swat({ api }: { api: SoloApi }) {
	const g = useRef(newSwat());
	const fx = useRef<({ kind: Fx["kind"]; id: number } | null)[]>(Array(9).fill(null));
	const face = useRef<{ m: Moment | null; n: number }>({ m: null, n: 0 });
	const ids = useRef(0);
	const [, redraw] = useReducer((x: number) => x + 1, 0);

	const apply = ({ s, fx: fxs }: { s: S; fx: Fx[] }) => {
		const was = g.current;
		g.current = s;
		for (const f of fxs) {
			fx.current[f.spot] = { kind: f.kind, id: ++ids.current };
			if (FACE[f.kind]) face.current = { m: FACE[f.kind]!, n: ids.current };
		}
		if (fxs.some((f) => f.kind === "zap")) sfx("zap");
		else if (fxs.some((f) => f.kind === "bite" || f.kind === "oops")) sfx("hit");
		if (s.score !== was.score) api.setScore(s.score);
		if (s.pests !== was.pests || fxs.length) redraw();
		if (s.lives <= 0 && was.lives > 0) api.end(s.score, "The mosquitoes won this round");
	};
	const swat = (spot: number) => !api.paused && apply(hit(g.current, spot));

	useLoop((dt) => apply(step(g.current, dt)), !api.paused);
	useKeys((k) => {
		const spot = PAD.indexOf(k);
		if (spot >= 0) swat(spot);
		return spot >= 0;
	}, !api.paused);

	const s = g.current;
	const over = s.lives <= 0;
	return (
		<div className="ar-field ar-swat-field" data-paused={api.paused && !over ? "" : undefined}>
			<div className="ar-swat-bar">
				<span className="ar-swat-lives" role="img" aria-label={`${s.lives} of ${LIVES} lives left`}>
					{Array.from({ length: LIVES }, (_, i) => (
						<Flower key={i} className={cls("ar-swat-life", i >= s.lives && "gone")} />
					))}
				</span>
				<Head who={api.you} mood={over ? "aww" : "idle"} moment={face.current.m} nonce={face.current.n} h="2em" />
			</div>
			<div className="ar-swat-grid">
				{PAD.map((key, i) => {
					const p = s.pests.find((p) => p.spot === i);
					const f = fx.current[i];
					return (
						<button
							key={key}
							className="ar-swat-spot"
							aria-label={`Spot ${key}${p ? (p.kind === "bug" ? ", a mosquito!" : ", a tuberose") : ""}`}
							onPointerDown={(e) => e.button === 0 && swat(i)} // on the way down, not on click: it should feel instant
							onClick={(e) => e.detail === 0 && swat(i)} // Enter / Space / a screen reader (a pointer already swatted)
						>
							<span className="ar-swat-win" aria-hidden="true" />
							<span className="ar-swat-sill" aria-hidden="true" />
							{p?.kind === "rose" && <Tuberose key={p.id} className="ar-swat-rose" />}
							{p?.kind === "bug" && <Mosquito key={p.id} className="ar-swat-bug" />}
							{f && <Effect key={f.id} kind={f.kind} />}
							<span className="ar-swat-key" aria-hidden="true">
								{key}
							</span>
						</button>
					);
				})}
			</div>
		</div>
	);
}

/** What just happened at a spot. Each plays once when it mounts (re-keyed per event) and ends invisible. */
function Effect({ kind }: { kind: Fx["kind"] }) {
	return (
		<span className={`ar-swat-fx ${kind}`} aria-hidden="true">
			{kind === "zap" && (
				<>
					<span className="ar-swat-flash" />
					<Mosquito className="ar-swat-bug ar-swat-fried" />
					<svg className="ar-swat-bolt" viewBox="0 0 24 32">
						<path d="M14 1.5 3 18h8L8 30.5 21 12.5h-8z" />
					</svg>
				</>
			)}
			{kind === "bite" && (
				<>
					<Mosquito className="ar-swat-bug ar-swat-away" />
					<b className="ar-swat-ouch">ouch!</b>
				</>
			)}
			{kind === "oops" && <Tuberose className="ar-swat-rose ar-swat-sad" />}
			{kind === "miss" && <span className="ar-swat-ring" />}
		</span>
	);
}

/** A cartoon mosquito from the side: striped body, see-through wings, long legs and a long nose. */
function Mosquito({ className }: { className: string }) {
	return (
		<svg className={className} viewBox="0 0 64 64" aria-hidden="true">
			<g className="ar-swat-hover">
				<g className="ar-swat-legs">
					<path d="M24 35Q17 43 12 58M27 36Q25 47 22 62M31 35Q36 45 40 59M30 34Q42 38 52 51M25 33Q15 35 7 41M32 33Q46 33 58 42" />
					<path d="M16 25 10 17M18.5 24.5 16 16" />
				</g>
				<path className="ar-swat-nose" d="M13 34 3 48" />
				<g className="ar-swat-wings">
					<ellipse cx="39" cy="14" rx="13" ry="5.5" transform="rotate(-26 39 14)" />
					<ellipse cx="33" cy="11" rx="12.5" ry="5.5" transform="rotate(-58 33 11)" />
				</g>
				<ellipse className="ar-swat-ink" cx="45" cy="25" rx="15" ry="6.2" transform="rotate(-20 45 25)" />
				<path className="ar-swat-stripes" d="M38 22l2 6.4M44.5 19.8l2 6.2M51 17.8l1.7 5.6" />
				<ellipse className="ar-swat-ink" cx="27" cy="30" rx="7.5" ry="6.6" />
				<circle className="ar-swat-ink" cx="17" cy="30" r="5.6" />
				<circle className="ar-swat-eye" cx="16" cy="29" r="2.4" />
				<circle className="ar-swat-ink" cx="15.4" cy="29.2" r="1.1" />
			</g>
		</svg>
	);
}

// floret pairs up the stalk (x, y, lean), bottom first, like the garden's tuberose
const FLORETS = [
	[14, 40, -1],
	[26, 36, 1],
	[14.5, 29, -1],
	[25.5, 25.5, 1],
	[16, 19, -1],
	[24, 16, 1],
];
/** A tuberose stalk in a little pot: white waxy florets on a sage stem, buds at the tip. */
function Tuberose({ className }: { className: string }) {
	return (
		<svg className={className} viewBox="0 0 40 64" aria-hidden="true">
			<path className="ar-swat-leaf" d="M19 49C14 42 9 38 3 36c6 4 10 8 13 13z" />
			<path className="ar-swat-leaf" d="M21 49c5-8 10-12 16-14-6 5-10 9-12 14z" />
			<path className="ar-swat-stem" d="M20 49V8" />
			<path className="ar-swat-stem-in" d="M20 49V8" />
			{FLORETS.map(([x, y, lean]) => (
				<g key={y} className="ar-swat-floret" transform={`translate(${x} ${y}) rotate(${lean * 15}) scale(1.1)`}>
					{[0, 60, 120, 180, 240, 300].map((a) => (
						<ellipse key={a} cy="-3.2" rx="1.9" ry="3.3" transform={`rotate(${a})`} />
					))}
					<circle r="1.3" />
				</g>
			))}
			<ellipse className="ar-swat-bud" cx="17.5" cy="10" rx="1.9" ry="4" transform="rotate(-25 17.5 10)" />
			<ellipse className="ar-swat-bud" cx="22.5" cy="8" rx="1.9" ry="4" transform="rotate(25 22.5 8)" />
			<ellipse className="ar-swat-bud" cx="20" cy="4.5" rx="1.7" ry="3.6" />
			<path className="ar-swat-pot" d="M11 50h18l-2 13H13z" />
			<rect className="ar-swat-pot" x="9" y="47" width="22" height="5" rx="2" />
		</svg>
	);
}
