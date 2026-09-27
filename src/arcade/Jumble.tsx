import { useEffect, useRef, useState } from "react";
import { FastForward } from "@phosphor-icons/react";
import { Head } from "../Character";
import { normalize } from "../gameLogic";
import { cls, draw, Timer, vars } from "../games/lead";
import { useKeys, useLoop, type SoloApi } from "./kit";
import { scramble, WORDS, type Word } from "./logic/jumble";
import "./jumble.css";
import { sfx } from "./sound";

/* Jumble: a minute to unscramble as many words from the decks as you can. Tap the letters (or type them)
   into the slots; a full row is checked straight away. Skip shows the answer for a second. */

const TIME = 60;
type Round = { word: Word; tiles: string[]; slots: (number | null)[] };
type Flash = "" | "right" | "wrong" | "skip";

const deal = (): Round => {
	const word = draw("jumble", WORDS, (x) => x.w);
	const tiles = [...scramble(word.w.toUpperCase())];
	return { word, tiles, slots: tiles.map(() => null) };
};

export default function Jumble({ api }: { api: SoloApi }) {
	const [r, setR] = useState(deal);
	const [flash, setFlash] = useState<Flash>("");
	const [left, setLeft] = useState(TIME);
	const clock = useRef(TIME);
	const deadline = useRef(0);
	const score = useRef(0);
	const timer = useRef(0);
	useEffect(() => () => clearTimeout(timer.current), []);

	// A wall clock, not summed frame times: those are capped per frame, so a slow phone would get a longer minute.
	useEffect(() => {
		if (!api.paused) deadline.current = performance.now() + clock.current * 1000; // (re)start where it stopped
	}, [api.paused]);
	useLoop(() => {
		clock.current = (deadline.current - performance.now()) / 1000;
		const s = Math.max(0, Math.ceil(clock.current));
		if (s !== left) setLeft(s);
		if (clock.current > 0) return;
		clearTimeout(timer.current); // no new word under the Game over card
		api.end(score.current, "Time's up");
	}, !api.paused);

	const busy = flash !== "" || api.paused;
	const later = (ms: number, fn: () => void) => (timer.current = window.setTimeout(fn, ms));
	const next = () => {
		setR(deal());
		setFlash("");
	};
	const place = (i: number) => {
		const j = r.slots.indexOf(null);
		if (busy || j < 0 || r.slots.includes(i)) return;
		const slots = r.slots.map((s, k) => (k === j ? i : s));
		setR({ ...r, slots });
		if (slots.includes(null)) return sfx("tick");
		if (normalize(slots.map((k) => r.tiles[k!]).join("")) === normalize(r.word.w)) {
			sfx("coin");
			api.setScore(++score.current);
			setFlash("right");
			later(600, next);
		} else {
			sfx("hit");
			setFlash("wrong");
			later(500, () => {
				setR((cur) => ({ ...cur, slots: cur.slots.map(() => null) }));
				setFlash("");
			});
		}
	};
	const unplace = (j: number) => !busy && setR({ ...r, slots: r.slots.map((s, k) => (k === j ? null : s)) });
	const skip = () => {
		if (busy) return;
		setFlash("skip");
		later(1000, next);
	};

	const onKey = (k: string) => {
		if (k === "Backspace") {
			const j = r.slots.findLastIndex((s) => s !== null);
			if (j >= 0) unplace(j);
			return j >= 0;
		}
		if (!/^[a-z]$/.test(k)) return false;
		const i = r.tiles.findIndex((t, n) => t === k.toUpperCase() && !r.slots.includes(n));
		if (i >= 0) place(i);
		return i >= 0;
	};
	useKeys(onKey, !api.paused);

	const hide = api.paused && clock.current > 0; // before the start and while paused: no peeking
	const shown = flash === "skip" ? [...r.word.w.toUpperCase()] : r.slots.map((i) => (i === null ? "" : r.tiles[i]));
	const n = r.tiles.length;
	return (
		<div className="ar-field ar-jumble-desk" style={vars({ "--n": n, "--cols": n <= 6 ? n : Math.ceil(n / 2) })}>
			<div className="ar-jumble-top">
				<Head who={api.you} h="3.3em" mood={hide ? "ponder" : "idle"} moment={flash === "right" ? "happy" : flash === "wrong" ? "wiggle" : null} />
				<p className="ar-jumble-hint">
					<small>Hint</small>
					<b>{r.word.hint}</b>
				</p>
				<Timer left={left} total={TIME} />
			</div>
			<div className={cls("ar-jumble-slots", flash)} key={`s-${r.word.w}`} aria-live="polite">
				{shown.map((ch, j) => (
					<button
						key={j}
						className="ar-jumble-slot"
						style={vars({ "--i": j })}
						disabled={!ch}
						aria-label={ch ? `${ch}, tap to take it back` : `Empty slot ${j + 1}`}
						onClick={() => unplace(j)}
					>
						{hide ? "" : ch}
					</button>
				))}
			</div>
			<div className="ar-jumble-tiles" key={`t-${r.word.w}`}>
				{r.tiles.map((ch, i) => {
					const used = flash === "skip" || r.slots.includes(i);
					return (
						<button key={i} className={cls("ar-jumble-tile", used && "used")} style={vars({ "--i": i })} disabled={used} aria-label={`Letter ${ch}`} onClick={() => place(i)}>
							{hide ? "" : ch}
						</button>
					);
				})}
			</div>
			<button className="btn ghost sm ar-jumble-skip" onClick={skip} disabled={flash === "skip"}>
				<FastForward aria-hidden />
				Skip
			</button>
		</div>
	);
}
