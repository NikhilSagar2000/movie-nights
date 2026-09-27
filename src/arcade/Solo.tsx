import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Pause, Play } from "@phosphor-icons/react";
import type { Who } from "../../shared/types";
import { FlowerBurst, Head, Loader } from "../Character";
import { cls, Rain, vars } from "../games/lead";
import { bestKey, fmt, readBest, saveBest, soloMeta, type SoloId } from "./index";
import { useKeys, type SoloApi } from "./kit";

/* The frame around every solo game: back, title, score and best, pause, then the game's stage with its
   "tap to start", "paused" and "game over" cards on top. "Play again" remounts the game with a new key. */

type Phase = "ready" | "play" | "paused" | "over";
type Result = { score: number | null; note?: string; newBest: boolean; at: number };

export default function Solo({ id, you, waiting }: { id: SoloId; you: Who; waiting?: string }) {
	const m = soloMeta(id);
	const [run, setRun] = useState(0);
	const [mode, setMode] = useState(m.modes?.[0].id);
	const [phase, setPhase] = useState<Phase>(m.realtime ? "ready" : "play");
	const [score, setScore] = useState(0);
	const [best, setBest] = useState(() => readBest(bestKey(id, mode)));
	const [result, setResult] = useState<Result | null>(null);
	const stage = useRef<HTMLDivElement>(null);
	const live = useRef({ phase, mode });
	useEffect(() => {
		live.current = { phase, mode };
	});

	useEffect(() => {
		scrollTo(0, 0); // opened from further down the hub (a block: newer browsers return a promise from scrollTo)
	}, [id]);
	// a hidden tab pauses a real-time game
	useEffect(() => {
		const on = () => document.hidden && live.current.phase === "play" && m.realtime && setPhase("paused");
		document.addEventListener("visibilitychange", on);
		return () => document.removeEventListener("visibilitychange", on);
	}, [m.realtime]);

	// paused or over: focus leaves the game's buttons (a swatted window, a Minesweeper cell), so Space and Enter reach
	// "carry on" / "play again" instead of pressing a button under the card
	useEffect(() => {
		if (phase === "paused" || phase === "over") stage.current?.focus({ preventScroll: true });
	}, [phase]);
	const start = () => {
		setPhase("play");
		stage.current?.focus({ preventScroll: true }); // off the button, so Space doesn't press it again
	};
	const restart = (next = mode) => {
		setMode(next);
		setBest(readBest(bestKey(id, next)));
		setRun((r) => r + 1);
		setScore(0);
		setResult(null);
		setPhase(m.realtime ? "ready" : "play");
	};

	// stable, so a game can hold on to them in effects and loops
	const fns = useMemo(
		() => ({
			setScore: (n: number) => live.current.phase !== "over" && setScore(n),
			end: (s: number | null, note?: string) => {
				if (live.current.phase === "over") return;
				live.current.phase = "over"; // a second end() in the same frame is ignored
				const key = bestKey(id, live.current.mode);
				const b = readBest(key);
				const newBest = s !== null && (m.low ? b === null || s < b : s > 0 && (b === null || s > b));
				if (newBest) {
					saveBest(key, s);
					setBest(s);
				}
				if (s !== null) setScore(s);
				setResult({ score: s, note, newBest, at: Date.now() });
				setPhase("over");
			},
		}),
		[id, m.low],
	);
	const api: SoloApi = useMemo(() => ({ ...fns, paused: phase !== "play", you, mode }), [fns, phase, you, mode]);

	useKeys((k, e) => {
		const onControl = e.target instanceof Element && !!e.target.closest("button, a");
		if ((k === " " || k === "Enter") && !onControl) {
			if (e.repeat) return k === " "; // a held key (a long jump that crashed) mustn't restart and then start the next run
			if (phase === "ready" || phase === "paused") start();
			else if (phase === "over" && result && Date.now() - result.at > 700) restart(); // not the key that was still flapping
			return k === " "; // Space never scrolls the page here
		}
		if ((k === "Escape" || (k === "p" && !m.typing)) && m.realtime && (phase === "play" || phase === "paused")) {
			if (phase === "play") setPhase("paused");
			else start();
			return true;
		}
		return k.startsWith("Arrow"); // arrows never scroll the page here (a game's own arrow keys have already run)
	});

	const View = m.View;
	const label = m.unit === "time" ? "Time" : "Score";
	return (
		<main className="page gm-screen ar-screen">
			<a className="btn paper sm gm-back" href="#/games">
				<ArrowLeft aria-hidden />
				All games
			</a>
			<header className="gm-head">
				<h1 className="gm-title">{m.name}</h1>
				<div className="ar-chips">
					<span className="chip ar-score" aria-live="off">
						{label} <b>{fmt(score, m.unit)}</b>
					</span>
					<span className="chip fog">Best {best === null ? "–" : fmt(best, m.unit)}</span>
					{m.realtime && (
						<button
							className="btn paper sm icon"
							disabled={phase === "over"}
							aria-label={phase === "paused" ? "Carry on" : "Pause"}
							onClick={() => (phase === "play" ? setPhase("paused") : phase === "paused" ? start() : undefined)}
						>
							{phase === "paused" ? <Play aria-hidden /> : <Pause aria-hidden />}
						</button>
					)}
				</div>
			</header>
			{m.modes && (
				<div className="ar-modes" role="group" aria-label="Board size">
					{m.modes.map((o) => (
						<button key={o.id} className={cls("ar-mode", o.id === mode && "on")} aria-pressed={o.id === mode} onClick={() => restart(o.id)}>
							{o.label}
						</button>
					))}
				</div>
			)}
			{waiting && (
				<p className="chip ar-waiting">
					{waiting} is open for you two
					<a className="btn sm" href="#/games">
						Join
					</a>
				</p>
			)}
			<div className={cls("ar-stage", `ar-${id}`)} ref={stage} tabIndex={-1} style={vars({ "--aspect": m.aspect ?? 1 })}>
				<Suspense fallback={<Loader text="Getting it ready" />}>
					<View key={run} api={api} />
				</Suspense>
				{phase === "ready" && (
					<button className="ar-cover" onClick={start}>
						<b>Tap to start</b>
						<span>or press Space</span>
					</button>
				)}
				{phase === "paused" && (
					<button className="ar-cover" onClick={start}>
						<b>Paused</b>
						<span>Tap to carry on</span>
					</button>
				)}
				{phase === "over" && result && (
					<div className="ar-cover ar-over" role="status">
						<div className="ar-over-card">
							{result.newBest && <Rain />}
							<span className="ar-over-head">
								<Head who={you} mood={result.newBest ? "hop" : "aww"} h="5.5em" />
								{result.newBest && <FlowerBurst />}
							</span>
							<h2>{result.newBest ? "New best!" : (result.note ?? "Game over")}</h2>
							{result.score !== null && (
								<p>
									{label} {fmt(result.score, m.unit)}
									{!result.newBest && best !== null && ` · Best ${fmt(best, m.unit)}`}
								</p>
							)}
							{result.newBest && result.note && <p>{result.note}</p>}
							<div className="ar-over-btns">
								<button className="btn" onClick={() => restart()}>
									Play again
								</button>
								<a className="btn ghost" href="#/games">
									All games
								</a>
							</div>
						</div>
					</div>
				)}
			</div>
			<p className="gm-hint">{m.hint}</p>
		</main>
	);
}
