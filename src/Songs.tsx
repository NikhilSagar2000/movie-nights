// A song a day: the small pieces in the main bundle. The toast when one arrives, the radio on Home's table, the mixtape,
// and playSong(), which opens the radio (Radio.tsx, lazy). Picking a song is its own page (SongPicker.tsx, #/song).
import { lazy, Suspense, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { MusicNotes, Play, X } from "@phosphor-icons/react";
import { dayOf, songFrom, thumbOf } from "../shared/song";
import { other, type Song } from "../shared/types";
import { Head } from "./Character";
import { getRoom, profileOf, send, serverNow, useRoom, type RoomState } from "./room";
import "./songs.css";

const RadioDialog = lazy(() => import("./Radio"));
type Vars = CSSProperties & Record<`--${string}`, string | number>;

// ---------- one listener owns the radio dialog; anything can ask it to play a song ----------
const opens = new Set<(id: string) => void>();
export const pickSong = () => void (location.hash = "#/song");
/** Opens the radio on a song, already playing. Pressing play on one dedicated to you is what "played" means. */
export function playSong(id: string) {
	const room = getRoom();
	const song = room?.songs.find((s) => s.id === id);
	if (room && song && song.from !== room.you && !song.playedAt) send({ t: "song:played", id });
	opens.forEach((f) => f(id));
}

// the song playing right now (its tape spins in the mixtape)
let onAir: string | null = null;
const airListeners = new Set<() => void>();
export function setOnAir(id: string | null) {
	if (onAir === id) return;
	onAir = id;
	airListeners.forEach((l) => l());
}
const useOnAir = () =>
	useSyncExternalStore(
		(f) => (airListeners.add(f), () => void airListeners.delete(f)),
		() => onAir,
	);

/** Today in India, on the Room's clock (so a phone with a wrong clock still agrees). */
export const today = () => dayOf(serverNow());

const announced = new Map<string, string>(); // day → the song from them already announced for it (another id = they changed it)

/** Mounted once, after the door (inside FaceCams). */
export function SongListener() {
	const room = useRoom();
	const [open, setOpen] = useState<{ id: string; n: number } | null>(null); // n: bumps on every ask, to raise a minimized radio
	const [toast, setToast] = useState<{ song: Song; changed: boolean; key: number } | null>(null);

	useEffect(() => {
		const f = (id: string) => {
			setOpen({ id, n: Date.now() });
			setToast(null);
		};
		opens.add(f);
		return () => void opens.delete(f);
	}, []);

	const waiting = room ? room.songs.filter((s) => s.from !== room.you && !s.playedAt) : [];
	const waitingKey = waiting.map((s) => s.id).join();
	useEffect(() => {
		const fresh = waiting.filter((s) => announced.get(s.day) !== s.id);
		if (!fresh.length) return;
		const t = setTimeout(() => {
			const song = fresh.at(-1)!;
			const changed = announced.has(song.day);
			fresh.forEach((s) => announced.set(s.day, s.id)); // set here, not above, so StrictMode's double effect still announces
			setToast({ song, changed, key: Date.now() });
		}, 900);
		return () => clearTimeout(t);
	}, [waitingKey]);
	useEffect(() => {
		if (!toast) return;
		const t = setTimeout(() => setToast(null), 8000);
		return () => clearTimeout(t);
	}, [toast]);

	if (!room) return null;
	const them = profileOf(room, other(room.you));
	return (
		<>
			{toast && (
				<div className="lt-toast sr-toast" role="status" key={toast.key}>
					<MusicNotes aria-hidden weight="fill" />
					<span>
						<b>{them.name}</b> {toast.changed ? "changed today's song" : "dedicated a song to you"}
					</span>
					<button className="btn sm" onClick={() => playSong(toast.song.id)}>
						Play
					</button>
					<button className="btn icon ghost sm" aria-label="Dismiss" onClick={() => setToast(null)}>
						<X aria-hidden />
					</button>
				</div>
			)}
			{open && (
				<Suspense>
					<RadioDialog key={open.id} room={room} id={open.id} raise={open.n} onClose={() => setOpen(null)} />
				</Suspense>
			)}
		</>
	);
}

/** The radio's side, drawn: a lamp and the speaker grille (Radio.tsx adds the knobs and the notes). */
export const RadioSide = () => (
	<div className="rd-side" aria-hidden="true">
		<i className="rd-lamp" />
		<div className="rd-grille">
			{[0, 1, 2, 3, 4].map((i) => (
				<i key={i} style={{ "--i": i } as Vars} />
			))}
		</div>
	</div>
);

/** On Home's table: a little radio. Tap it to play their song (or, with none, to pick yours); the handwriting above says
 *  what's on, and lets you send or change yours. */
export function TableRadio({ room }: { room: RoomState }) {
	const partner = other(room.you);
	const them = profileOf(room, partner);
	const day = today();
	const theirs = songFrom(room.songs, partner, day);
	const mine = room.songs.find((s) => s.from === room.you && s.day === day);
	const fresh = !!theirs && !theirs.playedAt;
	const air = useOnAir();

	// a song arriving while you're looking: the radio hops (not on the first render)
	const [hop, setHop] = useState(0);
	const seen = useRef(theirs?.id);
	useEffect(() => {
		if (theirs && seen.current !== theirs.id) setHop((h) => h + 1);
		seen.current = theirs?.id;
	}, [theirs?.id]);

	const status = fresh ? `${them.name} sent a song!` : theirs ? "today's song" : "no song yet";
	return (
		<div className={`hm-thing hm-radio-thing${fresh ? " new" : ""}`} data-playing={(!!theirs && air === theirs.id) || undefined}>
			<p className="hm-cap">
				<span>{status}</span>
				{mine ? (
					mine.playedAt ? (
						<small>they played yours</small>
					) : (
						<a href="#/song">change yours</a>
					)
				) : (
					<a href="#/song">send one</a>
				)}
			</p>
			<Doodle flip />
			<button
				className="sr-radio"
				key={hop}
				data-hop={hop || undefined}
				onClick={() => (theirs ? playSong(theirs.id) : pickSong())}
				aria-label={theirs ? `Play ${theirs.title}, from ${them.name}` : `Pick a song for ${them.name}`}
				title={theirs?.title}
			>
				<i className="sr-radio-antenna" />
				<span className="sr-radio-screen">{theirs ? <img src={thumbOf(theirs.vid)} alt="" /> : <i className="moon" />}</span>
				<span className="sr-radio-side">
					<i className="sr-radio-lamp" />
					<i className="sr-radio-grille" />
					<i className="sr-radio-knob" />
				</span>
				<i className="sr-radio-note" />
			</button>
		</div>
	);
}

/** A little hand-drawn arrow from a caption down to its thing on the table. */
export const Doodle = ({ flip }: { flip?: boolean }) => (
	<svg className={`hm-doodle${flip ? " flip" : ""}`} viewBox="0 0 34 26" aria-hidden="true">
		<path d="M3 3C12 3 22 7 26 21" />
		<path d="M20.5 16.5 26.3 22 29.5 15" />
	</svg>
);

const dayLabel = (day: string) => {
	const t = today();
	if (day === t) return "Today";
	if (day === dayOf(serverNow() - 86_400_000)) return "Yesterday";
	return new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "long" });
};

/** Memories: every song either of you dedicated, a day at a time, newest first. Tap a tape to play it again. */
export function Mixtape({ room }: { room: RoomState }) {
	const them = profileOf(room, other(room.you));
	const air = useOnAir();
	const days = new Map<string, Song[]>();
	for (const s of [...room.songs].reverse()) days.set(s.day, [...(days.get(s.day) ?? []), s]);
	return (
		<section className="sr-mixtape" aria-labelledby="mixtape-h">
			<div className="mem-stubs-head">
				<h2 id="mixtape-h">Our mixtape</h2>
				<button className="btn paper sm" onClick={pickSong}>
					<MusicNotes aria-hidden weight="fill" />
					Dedicate a song
				</button>
			</div>
			{days.size ? (
				<ol className="sr-days">
					{[...days].map(([day, songs]) => (
						<li key={day}>
							<h3 className="sr-day">{dayLabel(day)}</h3>
							<ul className="sr-tapes">
								{songs.map((s, i) => {
									const mine = s.from === room.you;
									const fresh = !mine && !s.playedAt;
									return (
										<li key={s.id} style={{ "--i": i } as Vars}>
											<button
												className={`sr-tape${fresh ? " new" : ""}${air === s.id ? " on" : ""}`}
												data-who={s.from}
												onClick={() => playSong(s.id)}
												aria-label={`Play ${s.title}, ${mine ? `your song for ${them.name}` : `from ${them.name}`}`}
											>
												<span className="sr-tape-label">
													<img src={thumbOf(s.vid)} alt="" loading="lazy" />
													<span className="sr-tape-text">
														<b>{s.title}</b>
														<span>{mine ? `For ${them.name}` : `From ${them.name}`}</span>
													</span>
												</span>
												<span className="sr-tape-window" aria-hidden="true">
													<i className="sr-reel" />
													<i className="sr-reel" />
												</span>
												{s.note && <span className="sr-tape-note">{s.note}</span>}
												{fresh && <span className="sr-new">New</span>}
											</button>
										</li>
									);
								})}
							</ul>
						</li>
					))}
				</ol>
			) : (
				<div className="mem-empty">
					<span className="mem-peek" aria-hidden="true">
						<Head who="b" mood="away" />
						<Head who="a" mood="away" />
					</span>
					<p>
						<b>No songs yet</b>
						<br />
						Dedicate one to {them.name} and it waits here.
					</p>
				</div>
			)}
		</section>
	);
}
