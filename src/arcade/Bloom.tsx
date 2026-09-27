import { useEffect, useRef, useState } from "react";
import { cls, Rain, vars } from "../games/lead";
import { DIR_KEYS, reduced, useKeys, useSwipe, type Dir, type SoloApi } from "./kit";
import { canMove, newBoard, slide, spawn, type Gone } from "./logic/bloom";
import "./bloom.css";
import { sfx } from "./sound";

/* Bloom 2048: slide the board, two alike make the next flower, from a sprout up to a tuberose at 2048.
   DOM tiles: each slides by a transform keyed on its id, and new or merged ones pop in. */

const FLOWERS: Record<number, string> = { 2: "🌱", 4: "🌿", 8: "🌷", 16: "🌼", 32: "🌸", 64: "🌺", 128: "🌹", 256: "🪷", 512: "💐", 1024: "🏵️" };

export default function Bloom({ api }: { api: SoloApi }) {
	const [g, setG] = useState(() => ({ board: newBoard(), gone: [] as Gone[], score: 0 }));
	const [won, setWon] = useState(false);
	const field = useRef<HTMLDivElement>(null);

	const move = (d: Dir) => {
		const s = slide(g.board, d);
		if (!s.moved) return;
		const score = g.score + s.gained;
		setG({ board: spawn(s.board), gone: s.gone, score });
		if (s.gained) api.setScore(score);
		const top = Math.max(0, ...s.gone.map((t) => t.v * 2)); // the biggest flower this move made
		if (!won && top >= 2048) {
			setWon(true);
			sfx("chime");
		} else if (top) sfx("pop", 0.8 + Math.log2(top) / 12);
		else sfx("tick");
	};
	useKeys((k) => {
		const d = DIR_KEYS[k];
		if (d) move(d);
		return !!d;
	}, !api.paused);
	useSwipe(field, move, !api.paused);

	useEffect(() => {
		if (canMove(g.board)) return;
		const t = setTimeout(() => api.end(g.score, "No moves left"), 700); // let the last move land first
		return () => clearTimeout(t);
	}, [g]);

	// sorted by id: React never reorders the nodes, so a moved tile keeps its transition
	const tiles = [...g.gone.map((t) => ({ ...t, ghost: true })), ...g.board.flatMap((row, r) => row.flatMap((t, c) => (t ? [{ ...t, r, c, ghost: false }] : [])))].sort(
		(a, b) => a.id - b.id,
	);
	const label = g.board.map((row) => row.map((t) => t?.v ?? "empty").join(" ")).join(", ");
	return (
		<div className="ar-field ar-bloom-bed" ref={field}>
			<div className="ar-bloom-board" role="img" aria-label={`Bloom board, row by row: ${label}`}>
				<div className="ar-bloom-cells">
					{Array.from({ length: 16 }, (_, i) => (
						<span key={i} />
					))}
				</div>
				{tiles.map((t) => (
					<div key={t.id} className={cls("ar-bloom-tile", t.ghost && "gone")} style={vars({ "--r": t.r, "--c": t.c })} data-v={Math.min(t.v, 2048)}>
						<div className={cls("ar-bloom-face", t.fresh && "fresh", t.merged && "merged")}>
							{t.v >= 2048 ? <Tuberose /> : <span className="ar-bloom-art">{FLOWERS[t.v]}</span>}
							<b className="ar-bloom-num">{t.v}</b>
						</div>
					</div>
				))}
			</div>
			{won && (
				<>
					{!reduced() && <Rain />}
					<p className="ar-bloom-toast" role="status">
						<span>A tuberose! Keep going</span>
					</p>
				</>
			)}
		</div>
	);
}

/** A little tuberose stalk, drawn like the Garden's: white waxy florets on a sage stalk, buds at the tip. */
function Tuberose() {
	const florets: [number, number, number][] = [
		[14.5, 31, -1],
		[25.5, 27.5, 1],
		[15, 22, -1],
		[25, 18.5, 1],
	];
	const stem = "M20 45 C20 34 19.5 22 20 9";
	return (
		<svg className="ar-bloom-tr" viewBox="0 0 40 46" aria-hidden="true">
			<path className="leaf" d="M20 45 C16 38 11 35 6 34 C11 37 15 40 18.5 45 Z" />
			<path className="leaf" d="M20 45 C24 37 29 34 34 33 C29 36 25 40 21.5 45 Z" />
			<path className="stem" d={stem} />
			<path className="stem-in" d={stem} />
			{florets.map(([x, y, lean]) => (
				<g key={y} className="floret" transform={`translate(${x} ${y}) rotate(${lean * 15})`}>
					{[0, 60, 120, 180, 240, 300].map((a) => (
						<ellipse key={a} cx="0" cy="-3.2" rx="1.9" ry="3.3" transform={`rotate(${a})`} />
					))}
					<circle r="1.3" />
				</g>
			))}
			<ellipse className="bud" cx="17.5" cy="12" rx="2" ry="4.2" transform="rotate(-28 17.5 12)" />
			<ellipse className="bud" cx="22.5" cy="9.5" rx="2" ry="4.2" transform="rotate(28 22.5 9.5)" />
			<ellipse className="bud" cx="20" cy="5" rx="1.7" ry="3.6" />
		</svg>
	);
}
