// "A song a day": pick today's song for the other person (#/song, lazy). Search runs 1 s after you stop typing (or on
// Enter), and only with at least 4 letters: YouTube gives 100 free searches a day. Tap a result to put it on the radio,
// add a line, send. Today's song can be changed until they've played it.
import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type MouseEvent, type RefObject } from "react";
import { MagnifyingGlass, MusicNotes, PaperPlaneTilt } from "@phosphor-icons/react";
import { clock, searchKey, slotFor, thumbOf } from "../shared/song";
import { LIMITS, other, type SongSearch } from "../shared/types";
import { Radio, type Tune } from "./Radio";
import { profileOf, send, useRoom } from "./room";
import { RadioSide, today } from "./Songs";
import "./songs.css";

type Vars = CSSProperties & Record<`--${string}`, string | number>;
const WAIT_MS = 1000;
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const memo = new Map<string, SongSearch>(); // this page load's answers: the same search is never sent twice

type Found = { key: string; state: "idle" | "waiting" | "loading" | "done"; res?: SongSearch };

/** Searches for `text` 1 s after it stops changing (or at once, with `now`). Never twice for the same search, and an
 *  answer only lands if it's still for what's typed, so a slow old answer can't replace a newer one. */
function useSongSearch(text: string) {
	const key = searchKey(text);
	const [found, setFound] = useState<Found>({ key: "", state: "idle" });
	const latest = useRef(key);
	latest.current = key;
	const pending = useRef<{ key: string; ctl: AbortController } | null>(null);
	const timer = useRef(0);

	const run = (k: string) => {
		clearTimeout(timer.current);
		if (!k || pending.current?.key === k) return;
		const saved = memo.get(k);
		if (saved) return setFound({ key: k, state: "done", res: saved });
		pending.current?.ctl.abort();
		const ctl = new AbortController();
		pending.current = { key: k, ctl };
		setFound((f) => ({ ...f, key: k, state: "loading" }));
		fetch(`/api/songs?q=${encodeURIComponent(k)}`, { signal: ctl.signal })
			.then((r) => (r.ok ? (r.json() as Promise<SongSearch>) : ({ error: "failed" } as const)))
			.catch((e: Error) => (e.name === "AbortError" ? null : ({ error: "failed" } as const)))
			.then((res) => {
				if (pending.current?.ctl === ctl) pending.current = null;
				if (!res) return;
				if (!("error" in res) || res.error !== "failed") memo.set(k, res); // a failure can be tried again
				if (latest.current === k) setFound({ key: k, state: "done", res });
			});
	};

	useEffect(() => {
		if (!key) {
			clearTimeout(timer.current);
			pending.current?.ctl.abort();
			pending.current = null;
			return setFound((f) => ({ ...f, key: "", state: "idle" }));
		}
		if (memo.has(key)) return run(key);
		setFound((f) => ({ ...f, key, state: "waiting" }));
		timer.current = window.setTimeout(() => run(key), WAIT_MS);
		return () => clearTimeout(timer.current);
	}, [key]);

	return { found, now: () => run(key) };
}

type Fly = { src: string; from: DOMRect; key: number };
type Sent = { tune: Tune; step: "fold" | "fly" | "done"; key: number };

export default function SongPicker() {
	const room = useRoom();
	const [text, setText] = useState("");
	const [pick, setPick] = useState<Tune | null>(null);
	const [note, setNote] = useState("");
	const [fly, setFly] = useState<Fly | null>(null);
	const [sent, setSent] = useState<Sent | null>(null);
	const stage = useRef<HTMLDivElement>(null);
	const { found, now } = useSongSearch(text);

	// the send: the song folds into a cassette, flies off, and "On its way" stays
	useEffect(() => {
		if (!sent || sent.step === "done") return;
		const t = setTimeout(() => setSent((s) => s && { ...s, step: s.step === "fold" ? "fly" : "done" }), sent.step === "fold" ? 1500 : 1700);
		return () => clearTimeout(t);
	}, [sent?.step, sent?.key]);

	if (!room) return null;
	const them = profileOf(room, other(room.you));
	const slot = slotFor(room.songs, room.you, today());
	const mine = typeof slot === "object" ? slot.replace : room.songs.find((s) => s.from === room.you && s.day === today());
	const locked = slot === "locked";
	const tune = pick ?? mine ?? null;

	const choose = (t: Tune, e: MouseEvent<HTMLButtonElement>) => {
		setSent(null);
		setPick(t);
		if (!note && mine?.note) setNote(mine.note); // swapping the song keeps the line you wrote
		const img = e.currentTarget.querySelector("img");
		if (img && !reduced()) setFly({ src: thumbOf(t.vid), from: img.getBoundingClientRect(), key: Date.now() });
		// on a phone the radio is above the results: bring it into view (on wide screens it's sticky beside them)
		if (matchMedia("(max-width: 899px)").matches) stage.current?.scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "start" });
	};
	const submit = (e: FormEvent) => {
		e.preventDefault();
		if (!pick || locked) return;
		send({ t: "song:send", vid: pick.vid, note: note.trim() });
		setSent({ tune: pick, step: reduced() ? "done" : "fold", key: Date.now() });
		setPick(null);
		setNote("");
	};
	const search = (e: FormEvent) => {
		e.preventDefault();
		now();
	};

	const res = found.res;
	const hits = res && "hits" in res ? res.hits : null;
	const stale = found.state !== "done";
	const hint =
		found.state === "idle"
			? text.trim()
				? "Type at least 4 letters. For a short title, add the singer."
				: "Search by song or singer."
			: found.state === "loading" && !hits
				? "Tuning in…"
				: found.state !== "done"
					? ""
					: res && "error" in res
						? res.error === "off"
							? "Search isn't set up yet."
							: res.error === "resting"
								? "Search is resting till tomorrow. YouTube's free searches for today are used up."
								: "Couldn't reach YouTube. Try again."
						: hits && !hits.length
							? "No songs found. Try adding the singer."
							: "";

	return (
		<main className="page sp-page">
			<header className="sp-head">
				<h1>A song for {them.name}</h1>
				<p className="sp-slot" aria-live="polite">
					{locked
						? `${them.name} has played today's song. Pick again tomorrow.`
						: mine
							? `Today's song is on its way. You can change it until ${them.name} plays it.`
							: `Pick today's song for ${them.name}.`}
				</p>
			</header>

			<div className="sp-grid">
				<div className="sp-stage" ref={stage}>
					{tune ? (
						<Radio key={`radio-${tune.vid}`} tune={tune} room={room} />
					) : (
						<div className="rd rd-idle" aria-hidden="true">
							<i className="rd-antenna" />
							<div className="rd-body">
								<div className="rd-face">
									<span className="rd-screen sr-nosignal">
										<i className="stars" />
										<i className="moon" />
										<span className="sr-nosignal-text">Tune in to a song</span>
									</span>
									<RadioSide />
								</div>
							</div>
						</div>
					)}

					{pick && !locked && (
						<form className="sp-pick" key={`pick-${pick.vid}`} onSubmit={submit}>
							{mine && mine.vid !== pick.vid && (
								<p className="sp-swap">
									<span className="sr-tape mini eject" aria-hidden="true">
										<span className="sr-tape-window">
											<i className="sr-reel" />
											<i className="sr-reel" />
										</span>
									</span>
									Instead of <b>{mine.title}</b>
								</p>
							)}
							<label className="sp-label" htmlFor="sp-note">
								A line for {them.name} <span>(if you like)</span>
							</label>
							<textarea
								id="sp-note"
								className="sp-note"
								rows={2}
								maxLength={LIMITS.songNote}
								value={note}
								onChange={(e) => setNote(e.target.value)}
								placeholder="This one made me think of you"
							/>
							<div className="sp-send-row">
								<span className="sp-count">
									{note.length}/{LIMITS.songNote}
								</span>
								<button className="btn blush">
									<PaperPlaneTilt aria-hidden />
									{mine ? "Swap today's song" : "Send it"}
								</button>
							</div>
						</form>
					)}

					{sent && (
						<div className="sp-sent" data-step={sent.step} key={sent.key}>
							{sent.step !== "done" ? (
								<span className="sp-cassette" aria-hidden="true">
									<span className="sr-tape">
										<span className="sr-tape-label">
											<img src={thumbOf(sent.tune.vid)} alt="" />
											<span className="sr-tape-text">
												<b>{sent.tune.title}</b>
												<span>For {them.name}</span>
											</span>
										</span>
										<span className="sr-tape-window">
											<i className="sr-reel" />
											<i className="sr-reel" />
										</span>
									</span>
									{[0, 1, 2, 3].map((i) => (
										<i key={i} className="sp-trail" style={{ "--i": i } as Vars}>
											{i % 2 ? "♫" : "♪"}
										</i>
									))}
								</span>
							) : (
								<p className="sp-done" role="status">
									<MusicNotes aria-hidden weight="fill" />
									<span>
										<b>On its way.</b> {them.name} will find it on their radio.
									</span>
									<a className="btn paper sm" href="#/">
										Back home
									</a>
								</p>
							)}
						</div>
					)}
				</div>

				<div className="sp-find">
					<form className="sp-search" role="search" onSubmit={search}>
						<MagnifyingGlass aria-hidden />
						<label className="sr-only" htmlFor="sp-q">
							Search for a song
						</label>
						<input
							id="sp-q"
							type="search"
							enterKeyHint="search"
							autoComplete="off"
							placeholder="Search a song or singer"
							value={text}
							maxLength={80}
							onChange={(e) => setText(e.target.value)}
						/>
					</form>
					{hint && (
						<p className="sp-hint" role={found.state === "done" ? "status" : undefined}>
							{hint}
							{res && "error" in res && res.error === "failed" && (
								<button className="btn ghost sm" onClick={now}>
									Try again
								</button>
							)}
						</p>
					)}
					{found.state === "loading" && !hits ? (
						<ul className="sp-results" aria-hidden="true">
							{[0, 1, 2, 3, 4].map((i) => (
								<li key={i} className="sp-ghost" style={{ "--i": i } as Vars} />
							))}
						</ul>
					) : (
						hits &&
						hits.length > 0 && (
							<ul className={`sp-results${stale ? " stale" : ""}`} key={found.key} aria-busy={stale || undefined}>
								{hits.map((h, i) => (
									<li key={h.vid} style={{ "--i": i } as Vars}>
										<button className="sp-hit" aria-pressed={pick?.vid === h.vid} onClick={(e) => choose(h, e)}>
											<img src={thumbOf(h.vid)} alt="" loading="lazy" />
											<span className="sp-hit-text">
												<b>{h.title}</b>
												<span>{h.channel}</span>
											</span>
											<span className="sp-dur">{clock(h.secs)}</span>
										</button>
									</li>
								))}
							</ul>
						)
					)}
				</div>
			</div>

			{fly && <FlyIn fly={fly} target={stage} onDone={() => setFly(null)} key={fly.key} />}
		</main>
	);
}

/** The picked song's thumbnail flies from its result into the radio's screen. */
function FlyIn({ fly, target, onDone }: { fly: Fly; target: RefObject<HTMLDivElement | null>; onDone: () => void }) {
	const [to, setTo] = useState<DOMRect | null>(null);
	useEffect(() => {
		// wait a frame: the radio has just been given the new song
		const r = requestAnimationFrame(() => {
			const screen = target.current?.querySelector(".rd-screen")?.getBoundingClientRect();
			if (screen) setTo(screen);
			else onDone();
		});
		return () => cancelAnimationFrame(r);
	}, []);
	if (!to) return null;
	const { from } = fly;
	const style = {
		left: from.left,
		top: from.top,
		width: from.width,
		height: from.height,
		"--dx": `${to.left + to.width / 2 - (from.left + from.width / 2)}px`,
		"--dy": `${to.top + to.height / 2 - (from.top + from.height / 2)}px`,
		"--s": Math.min(to.width / from.width, to.height / from.height),
	} as Vars;
	return <img className="sp-fly" src={fly.src} alt="" style={style} onAnimationEnd={onDone} />;
}
