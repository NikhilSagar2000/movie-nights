import { useEffect, useRef, useState, type KeyboardEvent, type SyntheticEvent } from "react";
import { Flag } from "@phosphor-icons/react";
import { Head } from "../Character";
import { cls, vars } from "../games/lead";
import { fmt, type SoloApi } from "./kit";
import { chord, flag, newBoard, open, type Board, type Cell } from "./logic/mines";
import "./mines.css";

/* Minesweeper, the old Windows classic: raised cream tiles on a dusky board. The clock starts on the first open,
   and the first tap is always safe. Right-click, long-press or Flag mode flags; a number with its flags placed
   opens everything around it. */

const SIZES: Record<string, [n: number, mines: number]> = { s: [9, 10], m: [12, 22], l: [16, 40] };
const HOLD = 400; // ms: a long-press flags on touch
const STEPS: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };

export default function Mines({ api }: { api: SoloApi }) {
	const [n, mines] = SIZES[api.mode ?? "s"] ?? SIZES.s;
	const [b, setB] = useState(() => newBoard(n, mines));
	const [flagMode, setFlagMode] = useState(false);
	const [focus, setFocus] = useState(Math.floor((n * n) / 2)); // the one cell Tab lands on; arrows move it
	const grid = useRef<HTMLDivElement>(null);
	const t0 = useRef(0);
	const press = useRef({ timer: 0, touch: false, held: false });
	const secs = () => Math.floor((performance.now() - t0.current) / 1000);
	const left = mines - b.cells.filter((c) => c.flag).length;

	const live = b.placed && b.state === "play";
	useEffect(() => {
		if (!live) return;
		const id = setInterval(() => api.setScore(secs()), 1000);
		return () => clearInterval(id);
	}, [live]);
	useEffect(() => {
		if (b.state === "won") {
			const s = secs();
			api.end(s, `Cleared in ${fmt(s, "time")}`);
		}
		if (b.state !== "lost") return;
		const t = setTimeout(() => api.end(null, "Boom! That was a mine"), 900); // a moment to see where they all were
		return () => clearTimeout(t);
	}, [b.state]);
	useEffect(() => () => clearTimeout(press.current.timer), []);

	const tap = (i: number) => {
		const next = b.cells[i].open ? chord(b, i) : flagMode ? flag(b, i) : open(b, i);
		if (next.placed && !b.placed) t0.current = performance.now();
		setB(next);
	};
	const at = (e: SyntheticEvent) => Number((e.target as Element).closest<HTMLElement>("[data-i]")?.dataset.i ?? -1);
	const letGo = () => clearTimeout(press.current.timer);

	const onKey = (e: KeyboardEvent) => {
		const i = at(e);
		if (i < 0) return;
		if (e.key === "f" || e.key === "F") return setB(flag(b, i));
		const d = STEPS[e.key];
		if (!d) return;
		e.preventDefault();
		const x = Math.min(n - 1, Math.max(0, (i % n) + d[0]));
		const y = Math.min(n - 1, Math.max(0, Math.floor(i / n) + d[1]));
		(grid.current?.children[y * n + x] as HTMLElement | undefined)?.focus();
	};

	return (
		<div className={cls("ar-field ar-mines-field", b.state === "lost" && "ar-mines-lost")}>
			<div className="ar-mines-bar">
				<button className={cls("ar-mines-flagmode", flagMode && "on")} aria-pressed={flagMode} onClick={() => setFlagMode((f) => !f)}>
					<Flag weight={flagMode ? "fill" : "bold"} aria-hidden />
					Flag mode
				</button>
				<Head who={api.you} mood={b.state === "won" ? "hop" : b.state === "lost" ? "aww" : "idle"} h="2.1em" />
				<span className="ar-mines-left" aria-label={`${left} mines left`}>
					<Mine />
					{left}
				</span>
			</div>
			<div className="ar-mines-wrap">
				<div
					ref={grid}
					className="ar-mines-grid"
					role="group"
					aria-label="Minefield"
					style={vars({ "--n": n })}
					onPointerDown={(e) => {
						const i = at(e);
						press.current.touch = e.pointerType !== "mouse";
						press.current.held = false;
						letGo();
						if (i < 0 || !press.current.touch || api.paused) return;
						press.current.timer = window.setTimeout(() => {
							press.current.held = true; // so letting go doesn't open it too
							setB((bb) => flag(bb, i));
						}, HOLD);
					}}
					onPointerUp={letGo}
					onPointerCancel={letGo}
					onPointerLeave={letGo}
					onClick={(e) => {
						const i = at(e);
						if (i < 0 || api.paused) return;
						if (press.current.held) return void (press.current.held = false);
						tap(i);
					}}
					onContextMenu={(e) => {
						e.preventDefault();
						const i = at(e);
						if (i >= 0 && !press.current.touch && !api.paused) setB(flag(b, i)); // touch flags by the long-press timer instead
					}}
					onFocus={(e) => {
						const i = at(e);
						if (i >= 0) setFocus(i);
					}}
					onKeyDown={onKey}
				>
					{b.cells.map((c, i) => {
						const s = look(c, i, b);
						return (
							<button key={i} className="ar-mines-cell" data-i={i} data-s={s} data-n={c.open ? c.near : undefined} tabIndex={i === focus ? 0 : -1} aria-label={say(c, i, n, s)}>
								{s === "flag" || s === "wrong" ? <Flag weight="fill" aria-hidden /> : s === "mine" || s === "hit" ? <Mine /> : c.open && c.near ? c.near : null}
							</button>
						);
					})}
				</div>
			</div>
		</div>
	);
}

/** How a cell shows: after a loss every mine shows, the one you hit in red, and wrong flags crossed out. */
function look(c: Cell, i: number, b: Board) {
	const lost = b.state === "lost";
	if (lost && i === b.hit) return "hit";
	if (lost && c.flag && !c.mine) return "wrong";
	if (c.flag) return "flag";
	if (lost && c.mine) return "mine";
	return c.open ? "open" : "hidden";
}

function say(c: Cell, i: number, n: number, s: string) {
	const where = `Row ${Math.floor(i / n) + 1}, column ${(i % n) + 1}`;
	if (s === "open") return `${where}, ${c.near ? `${c.near} mine${c.near > 1 ? "s" : ""} around` : "clear"}`;
	if (s === "hidden") return where;
	return `${where}, ${{ flag: "flagged", wrong: "flagged, no mine", mine: "a mine", hit: "the mine you hit" }[s]}`;
}

/** A little spiky round, drawn in currentColor. */
const Mine = () => (
	<svg className="ar-mines-mine" viewBox="-10 -10 20 20" aria-hidden="true">
		<path d="M0 -8.6V8.6M-8.6 0H8.6M-6.1 -6.1L6.1 6.1M-6.1 6.1L6.1 -6.1" />
		<circle r="5.8" />
		<circle className="ar-mines-glint" cx="-2.1" cy="-2.1" r="1.6" />
	</svg>
);
