// The song radio ("a song a day"): YouTube's player inside a drawn radio, driven by our own buttons. Lazy: it loads when
// a song is opened (Home, the mixtape) or picked (the song page). YouTube's rules: the video stays visible (the screen is
// never smaller than 200×200), and until you press play the screen shows a still, not a player.
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowClockwise, ArrowCounterClockwise, ArrowSquareOut, CornersIn, CornersOut, FilmSlate, Pause, Play, SpeakerHigh, SpeakerSlash, X } from "@phosphor-icons/react";
import { clock, thumbOf } from "../shared/song";
import { other, type Song } from "../shared/types";
import { loadApi, S, timeOf, type YTPlayer } from "./yt";
import { profileOf, send, type RoomState } from "./room";
import { longDate } from "./envelope";
import { setOnAir } from "./Songs";
import "./songs.css";

/** What's on the radio: a dedication (a Song) or a search result being previewed. */
export type Tune = { vid: string; title: string; channel: string; secs?: number };
type Vars = CSSProperties & Record<`--${string}`, string | number>;

const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const TUNE_MS = 1200; // the needle's sweep and the static, at least this long (usually YouTube takes about as long to load)
const GLYPHS = ["♪", "♫", "♪", "♬"];

/** Notes drifting out of the speaker: one every second or two while `on`; stopping lets the ones in the air finish. */
function useNotes(on: boolean) {
	const [notes, setNotes] = useState<{ id: number; x: number; g: string; d: number }[]>([]);
	useEffect(() => {
		if (!on) return;
		let timer = 0;
		const spawn = () => {
			const id = Date.now() + Math.random();
			setNotes((ns) => [...ns.slice(-6), { id, x: Math.random(), g: GLYPHS[Math.floor(Math.random() * GLYPHS.length)], d: 2.6 + Math.random() * 1.6 }]);
			timer = window.setTimeout(spawn, 900 + Math.random() * 1400);
		};
		timer = window.setTimeout(spawn, 400);
		return () => clearTimeout(timer);
	}, [on]);
	return [notes, (id: number) => setNotes((ns) => ns.filter((n) => n.id !== id))] as const;
}

/**
 * still: a picture of the song, nothing loaded · tuning: the player loads behind the static while the needle sweeps ·
 * on: the video, and our buttons drive it. `autoplay` starts tuning straight away (it was opened from a ▶).
 */
export function Radio({ tune, song, room, autoplay = false, onLeave }: { tune: Tune; song?: Song; room: RoomState; autoplay?: boolean; onLeave?: () => void }) {
	const host = useRef<HTMLDivElement>(null);
	const player = useRef<YTPlayer | null>(null);
	const tunedAt = useRef(0);
	const dragging = useRef(false);
	const [mode, setMode] = useState<"still" | "tuning" | "on">(autoplay ? "tuning" : "still");
	const [st, setSt] = useState(-1); // the player's state (S.*)
	const [t, setT] = useState(0);
	const [dur, setDur] = useState(tune.secs ?? 0);
	const [vol, setVol] = useState(100);
	const [muted, setMuted] = useState(false);
	const [blocked, setBlocked] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [ends, setEnds] = useState(0); // bumps when a song ends: the burst of notes replays
	const playing = mode === "on" && (st === S.PLAYING || st === S.BUFFERING);
	const ended = st === S.ENDED;
	const [notes, noteDone] = useNotes(playing && !reduced());
	const partnerOn = room.online.some((p) => p.who === other(room.you));

	// the song on air, so its tape spins in the mixtape
	useEffect(() => {
		if (!song) return;
		setOnAir(playing ? song.id : null);
		return () => setOnAir(null);
	}, [playing, song?.id]);

	const onAir = () => {
		const wait = reduced() ? 0 : Math.max(0, tunedAt.current + TUNE_MS - Date.now());
		setTimeout(() => setMode("on"), wait);
	};

	// tuning: load YouTube's player (hidden under the static) and start it
	useEffect(() => {
		if (mode !== "tuning" || player.current) return;
		let dead = false;
		tunedAt.current = Date.now();
		loadApi().then(
			(YT) => {
				if (dead || !host.current || player.current) return;
				const el = document.createElement("div");
				host.current.appendChild(el);
				player.current = new YT.Player(el, {
					videoId: tune.vid,
					width: "100%",
					height: "100%",
					playerVars: { autoplay: 1, controls: 0, disablekb: 1, playsinline: 1, rel: 0, iv_load_policy: 3, fs: 0 },
					events: {
						onReady: () => {
							const p = player.current;
							if (!p) return;
							setVol(p.getVolume());
							setMuted(p.isMuted());
							setDur((d) => p.getDuration() || d);
							p.playVideo();
						},
						onStateChange: (e: { data: number }) => {
							setSt(e.data);
							if (e.data === S.PLAYING) {
								setBlocked(false);
								onAir();
							}
							if (e.data === S.ENDED) setEnds((n) => n + 1);
						},
						onError: (e: { data: number }) => {
							setError(e.data === 101 || e.data === 150 ? "This song can't play outside YouTube." : "This song can't be played here.");
							setMode("on");
						},
						onAutoplayBlocked: () => {
							setBlocked(true);
							onAir();
						},
					},
				});
			},
			() => {
				setError("YouTube didn't load. Check the connection and try again.");
				setMode("on");
			},
		);
		return () => {
			dead = true;
		};
	}, [mode]);

	useEffect(
		() => () => {
			player.current?.destroy();
			player.current = null;
		},
		[],
	);

	// the needle follows the song
	useEffect(() => {
		if (mode !== "on") return;
		const i = setInterval(() => {
			const p = player.current;
			if (!p) return;
			const now = timeOf(p);
			if (now !== null && !dragging.current) setT(now);
			const d = p.getDuration();
			if (d) setDur(d);
		}, 250);
		return () => clearInterval(i);
	}, [mode]);

	// clicking YouTube's video moves keyboard focus into its iframe; hand it back so Space-to-talk and the keys here work
	useEffect(() => {
		const back = () =>
			setTimeout(() => {
				const f = player.current?.getIframe();
				if (f && document.activeElement === f) f.blur();
			}, 0);
		addEventListener("blur", back);
		return () => removeEventListener("blur", back);
	}, []);

	const start = () => {
		// pressing play is what "played" means (the Room keeps only the first)
		if (song && song.from !== room.you && !song.playedAt) send({ t: "song:played", id: song.id });
		const p = player.current;
		if (mode === "still") return setMode("tuning");
		if (!p) return;
		if (ended) p.seekTo(0, true);
		p.playVideo();
		setBlocked(false);
	};
	const toggle = () => (playing ? player.current?.pauseVideo() : start());
	const seek = (v: number, final: boolean) => {
		setT(v);
		player.current?.seekTo(v, final);
	};
	const skip = (d: number) => seek(Math.max(0, Math.min(dur - 1, t + d)), true);
	const setVolume = (v: number) => {
		const p = player.current;
		setVol(v);
		p?.setVolume(v);
		if (v > 0 && muted) {
			p?.unMute();
			setMuted(false);
		}
	};
	const toggleMute = () => {
		const p = player.current;
		if (muted) p?.unMute();
		else p?.mute();
		setMuted(!muted);
	};
	const together = () => {
		player.current?.pauseVideo();
		send({ t: "tube:load", id: tune.vid });
		onLeave?.();
		location.hash = "#/theater";
	};

	const live = mode === "on" && !error;
	const level = muted ? 0 : vol;
	return (
		<div
			className="rd"
			data-mode={mode}
			data-playing={playing || undefined}
			style={{ "--p": dur ? Math.min(1, t / dur) : 0, "--vol": level / 100 } as Vars}
		>
			<i className="rd-antenna" aria-hidden="true" />
			<div className="rd-body">
				<div className="rd-face">
					<div className="rd-screen">
						<img className="rd-thumb" src={thumbOf(tune.vid)} alt="" />
						<div ref={host} className="rd-frame" />
						<i className="rd-static" aria-hidden="true" />
						{(mode === "still" || blocked) && !error && (
							<button className="rd-big" onClick={start} aria-label={`Play ${tune.title}`}>
								<Play aria-hidden weight="fill" />
							</button>
						)}
						{error && (
							<div className="rd-error" role="alert">
								<p>{error}</p>
								<a className="btn paper sm" href={`https://www.youtube.com/watch?v=${tune.vid}`} target="_blank" rel="noreferrer">
									<ArrowSquareOut aria-hidden />
									Open on YouTube
								</a>
							</div>
						)}
						{ended && (
							<span className="rd-burst" key={ends} aria-hidden="true">
								{[0, 1, 2, 3, 4, 5].map((i) => (
									<i key={i} style={{ "--a": `${i * 60 - 90}deg` } as Vars}>
										{GLYPHS[i % GLYPHS.length]}
									</i>
								))}
							</span>
						)}
					</div>
					<div className="rd-side" aria-hidden="true">
						<i className="rd-lamp" />
						<div className="rd-grille">
							{[0, 1, 2, 3, 4].map((i) => (
								<i key={i} style={{ "--i": i } as Vars} />
							))}
						</div>
						<div className="rd-knobs">
							<i className="rd-knob tune" />
							<i className="rd-knob vol" />
						</div>
						<span className="rd-notes">
							{notes.map((n) => (
								<span key={n.id} className="rd-note" style={{ "--x": n.x, "--d": `${n.d}s` } as Vars} onAnimationEnd={() => noteDone(n.id)}>
									{n.g}
								</span>
							))}
						</span>
					</div>
				</div>

				<div className="rd-info">
					<p className="rd-title" title={tune.title}>
						{tune.title}
					</p>
					{tune.channel && <p className="rd-channel">{tune.channel}</p>}
				</div>

				<div className="rd-dial">
					<span className="rd-time">{clock(t)}</span>
					<div className="rd-scale">
						<input
							type="range"
							className="rd-seek"
							min={0}
							max={Math.max(1, Math.floor(dur))}
							step={1}
							value={Math.min(Math.floor(t), Math.floor(dur))}
							disabled={!live}
							aria-label="Where in the song"
							aria-valuetext={`${clock(t)} of ${clock(dur)}`}
							onPointerDown={() => (dragging.current = true)}
							onChange={(e) => seek(Number(e.target.value), !dragging.current)}
							onPointerUp={(e) => {
								dragging.current = false;
								seek(Number(e.currentTarget.value), true);
							}}
						/>
						<i className="rd-sweep" aria-hidden="true" />
					</div>
					<span className="rd-time">{dur ? clock(dur) : "–:––"}</span>
				</div>

				<div className="rd-keys">
					<button className="rd-key" onClick={() => skip(-10)} disabled={!live} aria-label="Back 10 seconds">
						<ArrowCounterClockwise aria-hidden />
						<small aria-hidden="true">10</small>
					</button>
					<button className="rd-key rd-main" onClick={toggle} disabled={!!error} aria-label={playing ? "Pause" : ended ? "Play again" : "Play"}>
						{playing ? <Pause aria-hidden weight="fill" /> : ended ? <ArrowClockwise aria-hidden weight="bold" /> : <Play aria-hidden weight="fill" />}
					</button>
					<button className="rd-key" onClick={() => skip(10)} disabled={!live} aria-label="Forward 10 seconds">
						<ArrowClockwise aria-hidden />
						<small aria-hidden="true">10</small>
					</button>
					<span className="rd-vol">
						<button className="rd-key sm" onClick={toggleMute} disabled={!live} aria-label={muted ? "Unmute" : "Mute"} aria-pressed={muted}>
							{muted || !vol ? <SpeakerSlash aria-hidden /> : <SpeakerHigh aria-hidden />}
						</button>
						<input type="range" className="rd-volume" min={0} max={100} value={level} disabled={!live} aria-label="Volume" onChange={(e) => setVolume(Number(e.target.value))} />
					</span>
				</div>
			</div>
			<div className="rd-foot">
				{partnerOn && (
					<button className="btn paper sm" onClick={together}>
						<FilmSlate aria-hidden />
						Play together
					</button>
				)}
				<a className="btn ghost sm rd-yt" href={`https://www.youtube.com/watch?v=${tune.vid}`} target="_blank" rel="noreferrer">
					<ArrowSquareOut aria-hidden />
					Open on YouTube
				</a>
			</div>
		</div>
	);
}

/**
 * A dedication, opened from Home or the mixtape: the radio (already tuning), and the note that came with it.
 * Minimize tucks it into a corner and it keeps playing while you go about the site: the same <dialog> turns from modal
 * to non-modal (never unmounted or moved, so YouTube's iframe doesn't reload). `raise` changes when someone asks to
 * play this song again: a minimized radio comes back up.
 */
export default function RadioDialog({ room, id, raise, onClose }: { room: RoomState; id: string; raise: number; onClose: () => void }) {
	const ref = useRef<HTMLDialogElement>(null);
	const [min, setMin] = useState(false);
	const song = room.songs.find((s) => s.id === id);
	useEffect(() => {
		const d = ref.current;
		if (d && !d.open) d.showModal();
	}, []);
	// changed for another song (or gone) while open: close, and the new one waits on Home
	useEffect(() => {
		if (!song) onClose();
	}, [!song]);
	const raised = useRef(raise);
	useEffect(() => {
		if (raise === raised.current) return;
		raised.current = raise;
		setMin(false);
	}, [raise]);

	// modal ↔ corner, and the radio glides between the two (FLIP: measure, switch, play the difference back)
	const switched = useRef(false);
	useLayoutEffect(() => {
		const d = ref.current;
		if (!switched.current || !d) return void (switched.current = true); // the first run is the mount
		const from = d.getBoundingClientRect();
		d.close(); // its "close" event comes later, when it's open again, so onClose below ignores it
		if (min) d.show();
		else d.showModal();
		if (reduced()) return;
		const to = d.getBoundingClientRect();
		d.animate(
			[{ transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width})`, opacity: 0.7 }, { transform: "none", opacity: 1 }],
			{ duration: 650, easing: "cubic-bezier(0.34, 1.2, 0.64, 1)" },
		);
	}, [min]);

	if (!song) return null;
	const close = () => ref.current?.close();
	const from = profileOf(room, song.from);
	const to = profileOf(room, other(song.from));
	const mine = song.from === room.you;
	return (
		<dialog
			ref={ref}
			className={`rd-dialog${min ? " min" : ""}`}
			aria-label={mine ? `Your song for ${to.name}` : `A song from ${from.name}`}
			onClose={() => !ref.current?.open && onClose()}
			onClick={(e) => !min && e.target === e.currentTarget && close()}
		>
			<span className="rd-corner">
				<button className="btn ghost icon sm rd-size" aria-label={min ? "Make the radio big again" : "Minimize, keep playing"} title={min ? "Expand" : "Minimize"} onClick={() => setMin(!min)}>
					{min ? <CornersOut aria-hidden /> : <CornersIn aria-hidden />}
				</button>
				<button className="btn ghost icon sm rd-close" aria-label="Close" onClick={close}>
					<X aria-hidden />
				</button>
			</span>
			<p className="rd-for">
				{mine ? `Your song for ${to.name}` : `${from.name} dedicated this to you`} · {longDate(song.at)}
			</p>
			<Radio tune={song} song={song} room={room} autoplay onLeave={close} />
			{song.note && (
				<p className="rd-slip">
					<span>{song.note}</span>
					<b>{from.name}</b>
				</p>
			)}
			{mine && <p className="rd-status">{song.playedAt ? `${to.name} played it` : `${to.name} hasn't played it yet`}</p>}
		</dialog>
	);
}
