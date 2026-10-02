import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Pause, Play, SpeakerHigh, SpeakerSlash } from "@phosphor-icons/react";
import { other, type Who } from "../../shared/types";
import { better } from "../../shared/bests";
import { Face, FlowerBurst, Head, Loader } from "../Character";
import { cls, FullButton, Rain, useFull, vars } from "../games/lead";
import { getRoom, profileOf, useRoom } from "../room";
import { bestKey, bestOf, fmt, saveBest, soloMeta, type SoloId } from "./index";
import { useKeys, type SoloApi } from "./kit";
import { setMuted, sfx, useMuted, useUnlockSound } from "./sound";

/* The frame around every solo game: back, title, the score, both of your bests, sound and pause, then the game's
   stage with its "tap to start", "paused" and "game over" cards on top. "Play again" remounts the game with a new key.
   Bests live in the Room, so you each see the other's. */

type Phase = "ready" | "play" | "paused" | "over";
/** `prev`/`theirs`: your best and theirs just before this run ended. */
type Result = { score: number | null; note?: string; newBest: boolean; prev: number | null; theirs: number | null; at: number };

export default function Solo({ id, you, waiting }: { id: SoloId; you: Who; waiting?: string }) {
	const m = soloMeta(id);
	const room = useRoom()!;
	const them = other(you);
	const partner = profileOf(room, them).name;
	const [run, setRun] = useState(0);
	const [mode, setMode] = useState(() => {
		const asked = location.hash.split("/")[3]; // "#/games/mines/l": a beat note's link opens that size
		return m.modes?.some((o) => o.id === asked) ? asked : m.modes?.[0].id;
	});
	const [phase, setPhase] = useState<Phase>(m.realtime ? "ready" : "play");
	const [score, setScore] = useState(0);
	const [result, setResult] = useState<Result | null>(null);
	const muted = useMuted();
	const [full, toggleFull] = useFull();
	const key = bestKey(id, mode);
	const mine = bestOf(room, you, key);
	const theirs = bestOf(room, them, key);
	const stage = useRef<HTMLDivElement>(null);
	const live = useRef({ phase, mode });
	useEffect(() => {
		live.current = { phase, mode };
	});

	useEffect(() => {
		scrollTo(0, 0); // opened from further down the hub (a block: newer browsers return a promise from scrollTo)
	}, [id]);
	useUnlockSound(); // browsers only let sound start from a tap or key
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
				const r = getRoom()!;
				const prev = bestOf(r, you, key);
				const newBest = s !== null && (m.low || s > 0) && better(id, s, prev ?? undefined);
				if (newBest) saveBest(you, key, s);
				sfx(newBest ? "best" : "over");
				if (s !== null) setScore(s);
				setResult({ score: s, note, newBest, prev, theirs: bestOf(r, other(you), key), at: Date.now() });
				setPhase("over");
			},
		}),
		[id, m.low, you],
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
	const show = (n: number | null) => (n === null ? "–" : fmt(n, m.unit));
	// the line about them on the game-over card
	const vs = (r: Result) => {
		if (r.score === null || r.theirs === null) return null;
		if (!r.newBest || !better(id, r.score, r.theirs)) return `${partner}'s best: ${show(r.theirs)}`;
		return r.prev === null || !better(id, r.prev, r.theirs) ? `You passed ${partner}'s ${show(r.theirs)}!` : `Still ahead of ${partner} (${show(r.theirs)})`;
	};
	const bestChip = (w: Who, n: number | null) => (
		<span className="chip fog ar-bestchip" title={w === you ? "Your best" : `${partner}'s best`}>
			<Face who={w} s="1.5em" ring={profileOf(room, w).color} />
			<span className="ar-who">{w === you ? "You" : partner}</span> <b>{show(n)}</b>
		</span>
	);
	return (
		<main className={cls("page gm-screen ar-screen", full)}>
			<a className="btn paper sm gm-back" href="#/games">
				<ArrowLeft aria-hidden />
				<span className="ar-back-text">All games</span>
			</a>
			<header className="gm-head">
				<h1 className="gm-title">{m.name}</h1>
				<div className="ar-chips">
					<span className="chip ar-score" aria-live="off">
						{label} <b>{fmt(score, m.unit)}</b>
					</span>
					{bestChip(you, mine)}
					{bestChip(them, theirs)}
					<button className="btn paper sm icon" aria-pressed={!muted} aria-label="Sound" onClick={() => setMuted(!muted)}>
						{muted ? <SpeakerSlash aria-hidden /> : <SpeakerHigh aria-hidden />}
					</button>
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
					<FullButton
						full={full}
						toggle={() => {
							toggleFull();
							stage.current?.focus({ preventScroll: true }); // off the button, so Space starts the game instead
						}}
						icon
					/>
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
									{!result.newBest && mine !== null && ` · Your best ${show(mine)}`}
								</p>
							)}
							{result.newBest && result.note && <p>{result.note}</p>}
							{vs(result) && <p className="ar-vs">{vs(result)}</p>}
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
