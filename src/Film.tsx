import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ClosedCaptioning, Pause, Play, SkipForward, Stop, WarningCircle, X } from "@phosphor-icons/react";
import { dismissProblem, filmDo, filmNow, setCc, showPlayer, stopFilm, useFilm } from "./filmPlayer";
import { clock } from "./filmLogic";
import "./film.css";

/* "Play a movie file", while one is on (loaded on demand; the picker is in Theater.tsx): the stage on the laptop with
   the file, and what both screens share: the control row, the subtitle line and the "Next episode" card. The player
   itself lives in filmPlayer.ts. */

/** The laptop with the file: the real player, at the file's own quality. */
export function FilmStage() {
	const box = useRef<HTMLDivElement>(null);
	useLayoutEffect(() => showPlayer(box.current!), []);
	return <div ref={box} className="fm-stage" />;
}

/** Re-render a few times a second while `on`, for a moving clock. */
function useTick(on: boolean) {
	const [, setN] = useState(0);
	useEffect(() => {
		if (!on) return;
		const t = setInterval(() => setN((n) => n + 1), 250);
		return () => clearInterval(t);
	}, [on]);
}

/** Under the stage, on both screens: play/pause, the seek bar, the title, subtitles, next and (for the owner) stop. */
export function FilmBar({ peerSharing }: { peerSharing: boolean }) {
	const { cc } = useFilm();
	const now = filmNow(peerSharing);
	useTick(!!now);
	const [drag, setDrag] = useState<number | null>(null);
	if (!now) return null;
	const { film, mine } = now;
	const pos = drag ?? now.pos;
	const commit = () => {
		if (drag === null) return;
		filmDo("seek", drag);
		setDrag(null);
	};
	return (
		<div className="fm-bar" role="group" aria-label="Movie controls">
			<button className="btn icon glass" aria-label={film.playing ? "Pause (K)" : "Play (K)"} onClick={() => filmDo(film.playing ? "pause" : "play")}>
				{film.playing ? <Pause weight="fill" aria-hidden /> : <Play weight="fill" aria-hidden />}
			</button>
			<span className="fm-time">{clock(pos)}</span>
			<input
				className="fm-seek"
				type="range"
				min={0}
				max={Math.max(1, Math.floor(film.dur))}
				step={1}
				value={Math.floor(pos)}
				aria-label="Seek (J and L jump 10 seconds)"
				aria-valuetext={`${clock(pos)} of ${clock(film.dur)}`}
				onChange={(e) => setDrag(+e.target.value)}
				onPointerUp={commit}
				onKeyUp={commit}
				onBlur={commit}
			/>
			<span className="fm-time">{clock(film.dur)}</span>
			<span className="fm-title" title={film.title}>
				{film.title}
			</span>
			{film.subs && (
				<button className="btn icon glass" aria-label="Subtitles on this screen" aria-pressed={cc} onClick={() => setCc(!cc)}>
					<ClosedCaptioning weight={cc ? "fill" : "regular"} aria-hidden />
				</button>
			)}
			{film.next && (
				<button className="btn glass sm fm-next" title={film.next} onClick={() => filmDo("next")}>
					<SkipForward aria-hidden />
					Next
				</button>
			)}
			{mine && (
				<button className="btn glass sm" onClick={stopFilm}>
					<Stop aria-hidden />
					Stop
				</button>
			)}
		</div>
	);
}

/** Over the movie on both screens: the subtitle line (if this screen shows them) and the "Next episode" card. */
export function FilmOverlay({ peerSharing }: { peerSharing: boolean }) {
	const { line, cc } = useFilm();
	const now = filmNow(peerSharing);
	if (!now) return null;
	const { film } = now;
	return (
		<>
			{cc && film.subs && line && (
				<p className="fm-subs" aria-live="off">
					<span>{line}</span>
				</p>
			)}
			{film.nextIn !== null && film.next && (
				<div className="fm-card" role="status">
					<span className="fm-card-label">Next episode in {film.nextIn}</span>
					<b className="fm-card-title">{film.next}</b>
					<span className="fm-card-btns">
						<button className="btn paper sm" onClick={() => filmDo("next")}>
							<Play weight="fill" aria-hidden />
							Play now
						</button>
						<button className="btn glass sm" onClick={() => filmDo("stay")}>
							Not yet
						</button>
					</span>
				</div>
			)}
		</>
	);
}

/** A file Chrome plays only half of: say which, and the one-line fix. */
export function FilmProblem() {
	const { problem } = useFilm();
	if (!problem) return null;
	const { name, kind } = problem;
	const base = name.replace(/\.[^.]+$/, "");
	const q = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`; // single quotes: names with ! or $ stay as they are in zsh
	return (
		<div className="th-banner fm-problem" role="alert">
			<WarningCircle aria-hidden />
			<div>
				{kind === "sound" ? (
					<p>
						“{name}” plays without sound in Chrome. Its sound is probably AC3 or DTS. Convert it once (the picture stays untouched), then
						play the new file:
					</p>
				) : (
					<p>Chrome can't play the picture in “{name}” (often HEVC/H.265). Convert it once (this one takes a while):</p>
				)}
				<code className="th-cmd">
					{kind === "sound"
						? `ffmpeg -i ${q(name)} -c:v copy -c:a aac ${q(`${base}-aac.mp4`)}`
						: `ffmpeg -i ${q(name)} -c:v libx264 -crf 20 -c:a aac ${q(`${base}-h264.mp4`)}`}
				</code>
			</div>
			<button className="btn icon ghost sm" aria-label="Dismiss" onClick={dismissProblem}>
				<X aria-hidden />
			</button>
		</div>
	);
}
