import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { CaretDown, CaretUp, ClosedCaptioning, ListNumbers, Pause, Play, Plus, SkipForward, Stop, WarningCircle, X } from "@phosphor-icons/react";
import {
	addFiles,
	dismissProblem,
	filmDo,
	filmNow,
	moveEpisode,
	playEpisode,
	removeEpisode,
	setCc,
	showPlayer,
	stopFilm,
	useFilm,
} from "./filmPlayer";
import { clock } from "./filmLogic";
import { profileOf, useRoom } from "./room";
import "./film.css";

/* "Play a movie file", while one is on (loaded on demand; the picker is in Theater.tsx): the stage and the playlist on
   the laptop with the files, and what both screens share: the control row, the paused sign, the subtitle line and the
   "Next episode" card. The player itself lives in filmPlayer.ts. */

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

/** Tell the stage this row's height, so it can lift the subtitles and the "Next episode" card above it (--bar-h, film.css). */
function measureBar(el: HTMLDivElement | null) {
	if (!el) return;
	const ro = new ResizeObserver(() => el.parentElement?.style.setProperty("--bar-h", `${el.offsetHeight}px`));
	ro.observe(el);
	return () => ro.disconnect();
}

/** Over the picture on both screens (under it while the movie is hidden): play/pause, the seek bar, the title, subtitles,
    next and (for the owner) stop. `up`: the pointer is moving on the picture (Theater.tsx). */
export function FilmBar({ peerSharing, up }: { peerSharing: boolean; up?: boolean }) {
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
		<div ref={measureBar} className={`fm-bar${up ? " up" : ""}`} role="group" aria-label="Movie controls">
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
			{mine && <FilmList current={film.i} />}
			{mine && (
				<button className="btn icon glass" aria-label="Stop" title="Stop the movie" onClick={stopFilm}>
					<Stop weight="fill" aria-hidden />
				</button>
			)}
		</div>
	);
}

/** The picked files, in play order, on the laptop with them: move, play now, take off, or add more. */
function FilmList({ current }: { current: number }) {
	const { playlist } = useFilm();
	const add = useRef<HTMLInputElement>(null);
	const last = playlist.length - 1;
	return (
		<>
			<button className="btn glass sm fm-list-btn" popoverTarget="fm-list">
				<ListNumbers aria-hidden />
				Playlist
			</button>
			<div id="fm-list" popover="auto" className="fm-list">
				<p className="fm-list-head">
					{playlist.length} {playlist.length === 1 ? "file" : "files"}, playing from this laptop
				</p>
				<ol>
					{playlist.map((ep, i) => (
						<li key={ep.id} className={i === current ? "on" : undefined}>
							<button
								className="fm-list-play"
								disabled={i === current}
								aria-label={i === current ? `${ep.title}, playing now` : `Play ${ep.title} now`}
								title={ep.title}
								onClick={() => playEpisode(i)}
							>
								<span className="fm-list-n">{i === current ? <Play weight="fill" aria-hidden /> : i + 1}</span>
								<span className="fm-list-title">{ep.title}</span>
								{ep.subs && <span className="fm-list-cc">CC</span>}
							</button>
							<button className="btn icon ghost sm" aria-label={`Move ${ep.title} up`} disabled={i === 0} onClick={() => moveEpisode(i, i - 1)}>
								<CaretUp aria-hidden />
							</button>
							<button className="btn icon ghost sm" aria-label={`Move ${ep.title} down`} disabled={i === last} onClick={() => moveEpisode(i, i + 1)}>
								<CaretDown aria-hidden />
							</button>
							<button className="btn icon ghost sm" aria-label={`Take ${ep.title} off the playlist`} disabled={i === current} onClick={() => removeEpisode(i)}>
								<X aria-hidden />
							</button>
						</li>
					))}
				</ol>
				<button className="btn sm fm-list-add" onClick={() => add.current?.click()}>
					<Plus aria-hidden />
					Add files
				</button>
				<input
					ref={add}
					type="file"
					multiple
					hidden
					accept="video/*,.mkv,.srt,.vtt"
					onChange={(e) => {
						const files = [...(e.target.files ?? [])];
						e.target.value = "";
						addFiles(files);
					}}
				/>
			</div>
		</>
	);
}

/** Over the movie on both screens: the subtitle line (if this screen shows them) and the "Next episode" card. */
export function FilmOverlay({ peerSharing }: { peerSharing: boolean }) {
	const { line, cc } = useFilm();
	const room = useRoom();
	const now = filmNow(peerSharing);
	// playing again: a play sign swells and fades (paused has its own sign, below)
	const playing = !!now?.film.playing;
	const was = useRef(playing);
	const [flash, setFlash] = useState(0);
	useEffect(() => {
		if (playing && !was.current) setFlash((n) => n + 1);
		was.current = playing;
	}, [playing]);
	if (!now || !room) return null;
	const { film } = now;
	const pausedBy = film.by && film.by !== room.you ? profileOf(room, film.by).name : null;
	return (
		<>
			{!film.playing && film.nextIn === null && (
				<button className="fm-paused" aria-label="Play (K)" onClick={() => filmDo("play")}>
					<span className="fm-disc">
						<Play weight="fill" aria-hidden />
					</span>
					{pausedBy && <span className="fm-paused-by">{pausedBy} paused</span>}
				</button>
			)}
			{flash > 0 && film.playing && (
				<span key={flash} className="fm-disc fm-flash" aria-hidden="true">
					<Play weight="fill" />
				</span>
			)}
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
