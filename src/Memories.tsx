// Memories: the watchlist jar (add, remove, shake → server pick → reveal), the ticket stubs wall and the letter box.
import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { EnvelopeSimple, FilmSlate, Heart, Plus, Shuffle, X } from "@phosphor-icons/react";
import { LIMITS, other, type JarItem, type Stub, type Who } from "../shared/types";
import { chocolatesLeft } from "../shared/gift";
import { Flower, FlowerBurst, Head } from "./Character";
import { readLetters, writeLetter } from "./Letters";
import { profileOf, send, useRoom, type RoomState } from "./room";
import "./memories.css";

type Pick = NonNullable<RoomState["picked"]>;
type Vars = CSSProperties & Record<`--${string}`, string>;

/** Stable pseudo-random tilt per id, so a stub/slip leans the same way on both screens and every render. */
const tilt = (id: string, max: number) => {
	const h = [...id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7);
	return `${(((Math.abs(h) % 200) / 100 - 1) * max).toFixed(2)}deg`;
};

function fmtDate(iso: string) {
	const d = new Date(`${iso.slice(0, 10)}T12:00:00`); // local noon: no off-by-one from UTC parsing
	const year = d.getFullYear() === new Date().getFullYear() ? undefined : "numeric"; // "Sat 13 Sep", like a real stub
	return isNaN(+d) ? iso : d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year });
}

/** Both heads asleep, peeking up from the bottom of a clip: the empty states. */
const Peek = () => (
	<span className="mem-peek" aria-hidden="true">
		<Head who="b" mood="away" />
		<Head who="a" mood="away" />
	</span>
);

export default function Memories() {
	const room = useRoom();
	return room ? (
		<main className="page mem-page">
			<h1 className="sr-only">Memories</h1>
			<JarSection room={room} />
			<StubWall room={room} />
			<LetterBox room={room} />
		</main>
	) : null;
}

// ---------- watchlist jar ----------

function JarSection({ room }: { room: RoomState }) {
	const [title, setTitle] = useState("");
	const [shaking, setShaking] = useState(false);
	const picked = room.picked;

	// Both screens wobble when a fresh pick lands; JarReveal (global) shows the result right after.
	useEffect(() => {
		if (!picked || Date.now() - picked.at > 2000) return;
		setShaking(true);
		const t = setTimeout(() => setShaking(false), 900);
		return () => clearTimeout(t);
	}, [picked]);

	const add = (e: FormEvent) => {
		e.preventDefault();
		const t = title.trim();
		if (!t) return;
		send({ t: "jar:add", title: t });
		setTitle("");
	};
	const shake = () => {
		setShaking(true);
		setTimeout(() => setShaking(false), 1500); // in case the pick never arrives (offline)
		send({ t: "jar:shake" });
	};

	// The last pick floats above the jar (once the wobble settles) while it's still in there.
	const out = !shaking && picked && room.jar.some((j) => j.id === picked.item.id) ? picked : null;
	const slips = out ? room.jar.filter((j) => j.id !== out.item.id) : room.jar;

	return (
		<section className="card mem-jar-card" aria-labelledby="jar-h">
			<div className="mem-jar-copy">
				<h2 id="jar-h">The watchlist jar</h2>
				<p className="muted">Drop in a movie you both want to see. When you cannot decide, the jar picks.</p>
				<form className="mem-add" onSubmit={add}>
					<label htmlFor="jar-in" className="label">
						Add a movie
					</label>
					<div className="mem-inline">
						<input
							id="jar-in"
							className="input"
							placeholder="A movie title"
							maxLength={LIMITS.title}
							value={title}
							onChange={(e) => setTitle(e.target.value)}
						/>
						<button className="btn ghost icon" aria-label="Add it to the jar" disabled={!title.trim()}>
							<Plus aria-hidden />
						</button>
					</div>
				</form>
				<button className="btn mem-pick" onClick={shake} disabled={!room.jar.length || shaking}>
					<Shuffle aria-hidden />
					Pick for us
				</button>
			</div>

			<div className="mem-jar-col">
				<div className="mem-jar-top">
					{out && (
						<div className="mem-picked" key={out.at}>
							<span className="sr-only">Last pick: </span>
							<Slip item={out.item} room={room} />
						</div>
					)}
				</div>
				<div className={`mem-jar${shaking ? " shaking" : ""}`}>
					{room.jar.length ? (
						<ul className="mem-slips" aria-label={`${room.jar.length} ${room.jar.length === 1 ? "movie" : "movies"} in the jar`}>
							{slips.map((j) => (
								<li key={j.id} className="mem-slip-li" style={{ "--tilt": tilt(j.id, 6) } as Vars}>
									<Slip item={j} room={room} />
								</li>
							))}
						</ul>
					) : (
						<div className="mem-jar-empty">
							<p>
								<b>The jar is empty</b>
								<br />
								Add the first movie.
							</p>
							<Peek />
						</div>
					)}
				</div>
			</div>
		</section>
	);
}

function Slip({ item, room }: { item: JarItem; room: RoomState }) {
	const by = profileOf(room, item.addedBy);
	return (
		<span className="mem-slip" style={{ "--who": by.color } as Vars}>
			<i className="mem-slip-dot" aria-hidden="true" />
			<span className="mem-slip-title" title={item.title}>
				{item.title}
			</span>
			<span className="sr-only">, added by {item.addedBy === room.you ? "you" : by.name}</span>
			<button className="mem-slip-x" aria-label={`Take “${item.title}” out of the jar`} onClick={() => send({ t: "jar:remove", id: item.id })}>
				<X aria-hidden />
			</button>
		</span>
	);
}

let revealedAt = 0;

/** Rendered globally (inside FaceCams) so a shake reveals the pick on both screens, whatever page each is on. */
export function JarReveal() {
	const room = useRoom();
	const picked = room?.picked ?? null;
	const [shown, setShown] = useState<Pick | null>(null);
	useEffect(() => {
		if (!picked || picked.at <= revealedAt || Date.now() - picked.at > 10_000) return;
		setShown(null);
		const t = setTimeout(() => {
			revealedAt = picked.at; // set here, not above, so StrictMode's double effect still reveals
			setShown(picked);
		}, 900); // let the jar wobble first
		return () => clearTimeout(t);
	}, [picked]);
	return room && shown ? <RevealDialog key={shown.at} room={room} pick={shown} onClose={() => setShown(null)} /> : null;
}

function RevealDialog({ room, pick, onClose }: { room: RoomState; pick: Pick; onClose: () => void }) {
	const ref = useRef<HTMLDialogElement>(null);
	const [settled, setSettled] = useState(false); // the shaker is dizzy while the pick unfolds
	useEffect(() => {
		const d = ref.current;
		if (d && !d.open) d.showModal();
		const t = setTimeout(() => setSettled(true), 2600);
		return () => clearTimeout(t);
	}, []);
	const by = profileOf(room, pick.by);
	// the shaker is dizzy, then happy; the other one is happy the moment the slip lands
	const head = (w: Who) =>
		w === pick.by ? <Head who={w} mood={settled ? "idle" : "dizzy"} moment={settled ? "happy" : null} /> : <Head who={w} moment="happy" twinkle />;
	return (
		<dialog ref={ref} className="mem-reveal" onClose={onClose} aria-labelledby="reveal-title">
			<button className="btn ghost icon sm mem-reveal-x" aria-label="Close" onClick={() => ref.current?.close()}>
				<X aria-hidden />
			</button>
			<div className="mem-reveal-scene arch">
				<h2 id="reveal-title" className="mem-reveal-slip">
					<span className="sr-only">The jar picked </span>
					{pick.item.title}
				</h2>
				<div className="mem-reveal-row" aria-hidden="true">
					{head("b")}
					<span className="mem-jar mem-jar-mini">
						<span className="mem-reveal-burst">
							<FlowerBurst />
						</span>
						<span className="mem-slips">
							{room.jar.slice(0, 7).map((j) => (
								<i key={j.id} className="mem-slip" style={{ "--tilt": tilt(j.id, 8) } as Vars} />
							))}
						</span>
					</span>
					{head("a")}
				</div>
				<span className="clouds" />
			</div>
			<p className="mem-reveal-by">{pick.by === room.you ? "You shook the jar." : `${by.name} shook the jar.`} This one is for tonight.</p>
			<div className="mem-reveal-actions">
				<a className="btn" href="#/theater" onClick={() => ref.current?.close()}>
					<FilmSlate aria-hidden />
					Let's watch it
				</a>
				<button className="btn ghost" disabled={!room.jar.length} onClick={() => send({ t: "jar:shake" })}>
					<Shuffle aria-hidden />
					Pick again
				</button>
			</div>
		</dialog>
	);
}

// ---------- ticket stubs ----------

function StubWall({ room }: { room: RoomState }) {
	const [adding, setAdding] = useState(false);
	const [title, setTitle] = useState("");
	const create = (e: FormEvent) => {
		e.preventDefault();
		const t = title.trim();
		if (!t) return;
		send({ t: "stub:new", title: t });
		setTitle("");
		setAdding(false);
	};
	return (
		<section className="mem-stubs" aria-labelledby="stubs-h">
			<div className="mem-stubs-head">
				<h2 id="stubs-h">Ticket stubs</h2>
				{!adding && (
					<button className="btn paper sm" onClick={() => setAdding(true)}>
						<Plus aria-hidden />
						New stub
					</button>
				)}
			</div>
			{adding && (
				<form className="mem-stub-new" onSubmit={create}>
					<label htmlFor="stub-in" className="sr-only">
						Movie title
					</label>
					<input
						id="stub-in"
						className="input"
						autoFocus
						placeholder="What did you watch?"
						maxLength={LIMITS.title}
						value={title}
						onChange={(e) => setTitle(e.target.value)}
						onKeyDown={(e) => e.key === "Escape" && setAdding(false)}
					/>
					<button className="btn" disabled={!title.trim()}>
						Print stub
					</button>
					<button type="button" className="btn ghost" onClick={() => setAdding(false)}>
						Cancel
					</button>
				</form>
			)}
			{room.stubs.length ? (
				<ul className="mem-stubs-grid">
					{room.stubs.map((s) => (
						<StubCard key={s.id} stub={s} room={room} />
					))}
				</ul>
			) : (
				<div className="mem-empty">
					<Peek />
					<p>
						<b>No stubs yet</b>
						<br />
						Your first movie night will live here.
					</p>
					<a className="btn" href="#/theater">
						<FilmSlate aria-hidden />
						Start one
					</a>
				</div>
			)}
		</section>
	);
}

function StubCard({ stub, room }: { stub: Stub; room: RoomState }) {
	const [confirm, setConfirm] = useState(false);
	const both = stub.hearts.a !== undefined && stub.hearts.b !== undefined;
	// full row when your half still needs rating, or a note needs the room
	const wide = stub.hearts[room.you] === undefined || Object.values(stub.notes).some((n) => (n?.length ?? 0) > 70);
	return (
		<li className={`mem-stub-li${wide ? " wide" : ""}`} style={{ "--tilt": tilt(stub.id, 1.2) } as Vars}>
			<article className="mem-stub" aria-label={`Ticket stub: ${stub.title}`}>
				<div className="mem-stub-top">
					<header className="mem-stub-head">
						<span className="mem-admit">Admit two</span>
						<time dateTime={stub.date}>{fmtDate(stub.date)}</time>
						{!confirm && (
							<button className="mem-x mem-stub-del" aria-label={`Delete the stub for ${stub.title}`} onClick={() => setConfirm(true)}>
								<X aria-hidden />
							</button>
						)}
					</header>
					{both && <Flower className="mem-stub-flw" />}
					<h3 className="mem-stub-title">{stub.title}</h3>
					{confirm && (
						<div className="mem-stub-confirm" role="group" aria-label="Delete this stub?">
							<span>Tear up this stub?</span>
							<button className="btn sm" onClick={() => send({ t: "stub:delete", id: stub.id })}>
								Tear it up
							</button>
							<button className="btn sm ghost" autoFocus onClick={() => setConfirm(false)}>
								Keep
							</button>
						</div>
					)}
				</div>
				<div className="mem-halves">
					{[room.you, other(room.you)].map((w) => (
						<Half key={w} stub={stub} who={w} room={room} />
					))}
				</div>
			</article>
		</li>
	);
}

function Hearts({ n }: { n: number }) {
	return (
		<span className="mem-hearts" role="img" aria-label={`${n} of 5 hearts`}>
			{[1, 2, 3, 4, 5].map((i) => (
				<Heart key={i} weight={i <= n ? "fill" : "regular"} aria-hidden />
			))}
		</span>
	);
}

function Half({ stub, who, room }: { stub: Stub; who: Who; room: RoomState }) {
	const p = profileOf(room, who);
	const hearts = stub.hearts[who];
	const side = who === room.you ? "me" : "them";
	if (hearts === undefined && who === room.you) return <RateForm stub={stub} name={p.name} />;
	return (
		<div className={`mem-half ${side}${hearts === undefined ? " pending" : ""}`}>
			<b className="mem-half-name">{p.name}</b>
			{hearts === undefined ? (
				<p className="mem-wait">Has not rated yet</p>
			) : (
				<>
					<Hearts n={hearts} />
					{stub.notes[who] && <p className="note">{stub.notes[who]}</p>}
				</>
			)}
		</div>
	);
}

function RateForm({ stub, name }: { stub: Stub; name: string }) {
	const [hearts, setHearts] = useState(0);
	const [hover, setHover] = useState(0);
	const [note, setNote] = useState("");
	const submit = (e: FormEvent) => {
		e.preventDefault();
		if (hearts) send({ t: "stub:rate", id: stub.id, hearts, note: note.trim() });
	};
	return (
		<form className="mem-half me mem-rate" onSubmit={submit}>
			<fieldset className="mem-heart-pick" onMouseLeave={() => setHover(0)}>
				<legend className="mem-half-name">
					{name}
					<span className="sr-only">, your hearts</span>
				</legend>
				{[1, 2, 3, 4, 5].map((n) => (
					<label key={n} className={n <= (hover || hearts) ? "on" : ""} onMouseEnter={() => setHover(n)}>
						<input type="radio" className="sr-only" name={`hearts-${stub.id}`} value={n} checked={hearts === n} onChange={() => setHearts(n)} />
						<Heart weight={n <= (hover || hearts) ? "fill" : "regular"} aria-hidden />
						<span className="sr-only">
							{n} {n === 1 ? "heart" : "hearts"}
						</span>
					</label>
				))}
			</fieldset>
			<textarea
				className="input mem-note-in"
				rows={2}
				maxLength={LIMITS.note}
				placeholder="A little note about tonight"
				aria-label="Your note"
				value={note}
				onChange={(e) => setNote(e.target.value)}
			/>
			<button className="btn sm" disabled={!hearts}>
				Save my half
			</button>
		</form>
	);
}

// ---------- letter box ----------

/** Every note either of you left, newest first. Tap one to open it again. */
function LetterBox({ room }: { room: RoomState }) {
	const them = profileOf(room, other(room.you));
	const letters = [...room.letters].reverse();
	return (
		<section className="mem-letters" aria-labelledby="letters-h">
			<div className="mem-stubs-head">
				<h2 id="letters-h">Letters</h2>
				<button className="btn paper sm" onClick={writeLetter}>
					<EnvelopeSimple aria-hidden />
					Write a letter
				</button>
			</div>
			{letters.length ? (
				<ul className="mem-letters-grid">
					{letters.map((l) => {
						const mine = l.from === room.you;
						const unread = !mine && !l.openedAt;
						const left = chocolatesLeft(l.gift);
						return (
							<li key={l.id} style={{ "--tilt": tilt(l.id, 3) } as Vars}>
								<button className={`mem-letter${unread ? " new" : ""}${l.gift ? " gift" : ""}`} data-paper={l.paper} onClick={() => readLetters([l.id])}>
									<span className="mem-letter-flap" aria-hidden="true" />
									{unread && <Flower className="mem-letter-seal" />}
									<span className="mem-letter-who">{mine ? `To ${them.name}` : `From ${them.name}`}</span>
									<span className="mem-letter-meta">{fmtDate(new Date(l.at).toLocaleDateString("sv-SE"))}</span>
									{(unread || mine) && <span className="mem-letter-state">{unread ? "New" : l.openedAt ? "Opened" : "Not opened yet"}</span>}
									{l.gift && (
										<span className="mem-letter-gift">
											{l.gift.bouquet && (
												<span title="Flowers">
													<Flower label="with flowers" />
												</span>
											)}
											{left && (
												<span title="Chocolates">
													<Heart aria-label="with chocolates" weight="fill" />
													{left.left ? `${left.left} of ${left.total} left` : "all eaten"}
												</span>
											)}
										</span>
									)}
								</button>
							</li>
						);
					})}
				</ul>
			) : (
				<div className="mem-empty">
					<Peek />
					<p>
						<b>No letters yet</b>
						<br />
						Leave {them.name} a note and it waits here for them.
					</p>
				</div>
			)}
		</section>
	);
}
