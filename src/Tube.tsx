// Listen together: one YouTube video on the theater stage, playing in sync on both screens. The Room keeps the truth
// ({pos, at, playing}); each browser plays its own copy straight from YouTube (full quality, no relay data) and nudges
// itself back in line when it drifts. Either person's play, pause and seek on YouTube's own controls act for both.
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ArrowLeft, ArrowSquareOut, Play, Plus, SkipForward, Stop, X, YoutubeLogo } from "@phosphor-icons/react";
import { parseYouTube, tubeAt } from "../shared/tube";
import type { Tube } from "../shared/types";
import { canPlayFiles } from "./filmPlayer";
import { profileOf, send, serverNow, type RoomState } from "./room";
import { loadApi, S, timeOf, type YTPlayer } from "./yt";

const DRIFT = 1.2; // seconds apart before we seek back in line

export function TubePlayer({ tube }: { tube: Tube }) {
	const host = useRef<HTMLDivElement>(null);
	const player = useRef<YTPlayer | null>(null);
	const latest = useRef(tube);
	latest.current = tube;
	const asked = useRef<{ state: number; at: number } | null>(null); // the play/pause we asked for (so it isn't mistaken for the user's)
	const seekQuiet = useRef(0); // until then, a jump in the timeline is our own seek
	const loading = useRef(0); // a video is loading (until this time at most): its state changes are the player's own, not the user's
	const load = () => (loading.current = Date.now() + 5000);
	const mineUntil = useRef(0); // the user just played/paused/seeked here: don't fight it until the Room confirms
	const sample = useRef({ t: 0, at: 0 }); // the local timeline, to tell a user's seek from buffering
	const [ready, setReady] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [blocked, setBlocked] = useState(false);

	const ask = (p: YTPlayer, state: number) => {
		asked.current = { state, at: Date.now() };
		if (state === S.PLAYING) p.playVideo();
		else p.pauseVideo();
	};
	const tell = (m: Parameters<typeof send>[0]) => {
		mineUntil.current = Date.now() + 2000;
		send(m);
	};
	/** Pull this player in line with the Room. */
	const sync = () => {
		const p = player.current;
		if (!p || Date.now() < mineUntil.current) return;
		const t = latest.current;
		const st = p.getPlayerState();
		const cur = timeOf(p);
		if (st === S.ENDED || cur === null) return;
		const want = tubeAt(t, serverNow());
		const dur = p.getDuration() ?? 0;
		// it should have finished already (e.g. you came back long after): move on instead of sitting on a dead player
		if (t.playing && dur > 0 && want >= dur - 0.25) return send({ t: "tube:ended", key: t.key });
		if (Math.abs(cur - want) > DRIFT) {
			seekQuiet.current = Date.now() + 2000;
			p.seekTo(want, true);
		}
		if (t.playing && st !== S.PLAYING && st !== S.BUFFERING) ask(p, S.PLAYING);
		// never pause a buffering player: that's how a play pressed here starts, before it says "playing"
		else if (!t.playing && st === S.PLAYING) ask(p, S.PAUSED);
	};
	const onState = (st: number) => {
		const p = player.current;
		if (!p) return;
		const t = latest.current;
		if (st === S.PLAYING) setBlocked(false);
		if (st === S.ENDED) return send({ t: "tube:ended", key: t.key }); // both report it; the Room advances once
		if (Date.now() < loading.current) {
			if (st === S.PLAYING || st === S.PAUSED || st === S.CUED) loading.current = 0; // settled: from now on changes are the user's
			return;
		}
		if (st !== S.PLAYING && st !== S.PAUSED) return;
		const cur = timeOf(p);
		if (cur === null) return;
		const a = asked.current;
		if (a && Date.now() - a.at < 4000 && a.state === st) {
			asked.current = null; // the state we asked for: not the user's doing
			return;
		}
		if (st === S.PLAYING && !t.playing) tell({ t: "tube:play", pos: cur });
		else if (st === S.PAUSED && t.playing) tell({ t: "tube:pause", pos: cur });
	};

	// one player per mount; YouTube swaps our inner element for its iframe, so React only owns the wrapper
	useEffect(() => {
		let dead = false;
		loadApi().then(
			(YT) => {
				if (dead || !host.current) return;
				const el = document.createElement("div");
				host.current.appendChild(el);
				const t = latest.current;
				seekQuiet.current = Date.now() + 3000;
				load();
				player.current = new YT.Player(el, {
					videoId: t.id,
					width: "100%",
					height: "100%",
					playerVars: { playsinline: 1, rel: 0, disablekb: 1, start: Math.floor(tubeAt(t, serverNow())) },
					events: {
						onReady: () => {
							setReady(true);
							sync();
						},
						onStateChange: (e: { data: number }) => onState(e.data),
						onError: (e: { data: number }) =>
							setError(e.data === 101 || e.data === 150 ? "This video can't play outside YouTube. Try another link." : "This video can't be played. Try another link."),
						onAutoplayBlocked: () => setBlocked(true),
					},
				});
			},
			() => setError("YouTube didn't load. Check the connection and try again."),
		);
		return () => {
			dead = true;
			player.current?.destroy();
			player.current = null;
		};
	}, []);

	// a new video (loaded, or the queue moved on)
	const firstKey = useRef(tube.key);
	useEffect(() => {
		const p = player.current;
		if (!ready || !p || tube.key === firstKey.current) return;
		firstKey.current = tube.key;
		setError(null);
		seekQuiet.current = Date.now() + 3000;
		load();
		sample.current = { t: 0, at: 0 }; // a new timeline
		const o = { videoId: tube.id, startSeconds: tubeAt(tube, serverNow()) };
		if (tube.playing) p.loadVideoById(o);
		else p.cueVideoById(o);
	}, [tube.key, ready]);

	// the Room changed (someone played, paused or seeked): follow it
	useEffect(() => {
		if (ready) sync();
	}, [tube.at, tube.playing, tube.pos, ready]);

	// every second: spot a seek made on this player (a jump in its timeline), otherwise stay in line
	useEffect(() => {
		const t = setInterval(() => {
			const p = player.current;
			if (!p || !ready) return;
			const now = Date.now();
			const cur = timeOf(p);
			if (cur === null) return;
			const { t: was, at } = sample.current;
			sample.current = { t: cur, at: now };
			if (at && now > seekQuiet.current && p.getPlayerState() !== S.ENDED) {
				const moved = cur - was;
				// buffering only stalls the clock; a jump back, or further than time allows, is a seek
				if (moved < -1 || moved > (now - at) / 1000 + 2) {
					return tell({ t: "tube:seek", pos: cur });
				}
			}
			sync();
		}, 1000);
		return () => clearInterval(t);
	}, [ready]);

	// clicking YouTube's controls moves keyboard focus into its iframe; hand it back so Space-to-talk and the reaction keys work
	useEffect(() => {
		const back = () =>
			setTimeout(() => {
				const f = player.current?.getIframe();
				if (f && document.activeElement === f) f.blur();
			}, 0);
		addEventListener("blur", back);
		return () => removeEventListener("blur", back);
	}, []);

	return (
		<div className="tb-player">
			<div ref={host} className="tb-frame" />
			{blocked && !error && (
				<button
					className="btn paper tb-tap"
					onClick={() => {
						player.current?.playVideo();
						setBlocked(false);
					}}
				>
					<Play aria-hidden weight="fill" />
					Tap to play along
				</button>
			)}
			{error && (
				<div className="tb-error" role="alert">
					<p>{error}</p>
					<div className="tb-error-actions">
						<button className="btn paper sm" onClick={() => send({ t: tube.queue.length ? "tube:skip" : "tube:stop" })}>
							{tube.queue.length ? "Play the next one" : "Close it"}
						</button>
						<a className="btn glass sm" href={`https://www.youtube.com/watch?v=${tube.id}`} target="_blank" rel="noreferrer">
							<ArrowSquareOut aria-hidden />
							Open on YouTube
						</a>
					</div>
				</div>
			)}
		</div>
	);
}

/** Paste a link: "load" plays it now, "queue" adds it to Up next. */
function LinkForm({ mode, autoFocus }: { mode: "load" | "queue"; autoFocus?: boolean }) {
	const [link, setLink] = useState("");
	const [bad, setBad] = useState(false);
	const submit = (e: FormEvent) => {
		e.preventDefault();
		const id = parseYouTube(link);
		setBad(!id);
		if (!id) return;
		setBad(false);
		send({ t: mode === "load" ? "tube:load" : "tube:queue", id });
		setLink("");
	};
	return (
		<form className="tb-form" onSubmit={submit}>
			<div className="tb-row">
				<input
					className="input"
					value={link}
					autoFocus={autoFocus}
					inputMode="url"
					aria-label="YouTube link"
					aria-invalid={bad || undefined}
					placeholder="Paste a YouTube link"
					onChange={(e) => {
						setLink(e.target.value);
						setBad(false);
					}}
				/>
				<button className="btn paper">
					{mode === "load" ? <Play aria-hidden weight="fill" /> : <Plus aria-hidden />}
					{mode === "load" ? "Play" : "Add"}
				</button>
			</div>
			{bad && <p className="tb-bad">{link.trim() ? "That doesn't look like a YouTube link." : "Paste a YouTube link first."}</p>}
		</form>
	);
}

/** The empty stage's two choices: the share button (passed in) or a YouTube link, which swaps in its own small form. */
export function TubeStart({ share }: { share: ReactNode }) {
	const [open, setOpen] = useState(false);
	return open ? (
		<>
			<div className="tb-start">
				<LinkForm mode="load" autoFocus />
			</div>
			<button className="btn glass sm" onClick={() => setOpen(false)}>
				<ArrowLeft aria-hidden />
				Back
			</button>
			<p className="th-plate-hint">It plays on both screens, in sync</p>
		</>
	) : (
		<>
			<div className="th-cta">
				{share}
				<button className="btn glass" onClick={() => setOpen(true)}>
					<YoutubeLogo aria-hidden />
					Play from YouTube
				</button>
			</div>
			{canPlayFiles && <p className="th-plate-hint">A movie file plays straight from your laptop. Nothing is uploaded.</p>}
		</>
	);
}

/** Under the stage while a video is on: what's playing, Up next, and the controls. */
export function TubeBar({ room, tube }: { room: RoomState; tube: Tube }) {
	return (
		<div className="tb-bar">
			<div className="tb-now">
				<YoutubeLogo aria-hidden weight="fill" />
				<span className="tb-title" title={tube.title}>
					{tube.title}
				</span>
				<span className="tb-by">from {tube.by === room.you ? "you" : profileOf(room, tube.by).name}</span>
				<span className="tb-actions">
					{tube.queue.length > 0 && (
						<button className="btn glass sm" onClick={() => send({ t: "tube:skip" })}>
							<SkipForward aria-hidden />
							Next
						</button>
					)}
					<button className="btn glass sm" onClick={() => send({ t: "tube:stop" })}>
						<Stop aria-hidden />
						Stop
					</button>
				</span>
			</div>
			{tube.queue.length > 0 && (
				<ol className="tb-queue" aria-label="Up next">
					{tube.queue.map((q) => (
						<li key={q.key}>
							<img src={`https://i.ytimg.com/vi/${q.id}/default.jpg`} alt="" width="48" height="36" loading="lazy" />
							<span className="tb-title">{q.title}</span>
							<button className="btn icon ghost sm" aria-label={`Remove ${q.title} from Up next`} onClick={() => send({ t: "tube:unqueue", key: q.key })}>
								<X aria-hidden />
							</button>
						</li>
					))}
				</ol>
			)}
			<LinkForm mode="queue" />
		</div>
	);
}
