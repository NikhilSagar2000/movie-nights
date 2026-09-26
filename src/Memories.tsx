// Memories: the watchlist jar (add, remove, shake → server pick → reveal) and the ticket stubs wall.
import { useEffect, useRef, useState, type FormEvent } from "react";
import { LIMITS, other, type Stub, type Who } from "../shared/types";
import { profileOf, send, useRoom, type RoomState } from "./room";
import Teddy from "./Teddy";
import { Icon, type Vars } from "./Theater";
import "./memories.css";

type Pick = NonNullable<RoomState["picked"]>;

/** Stable pseudo-random tilt per id, so a stub/slip leans the same way on both screens and every render. */
const tilt = (id: string, max: number) => {
	const h = [...id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7);
	return `${(((Math.abs(h) % 200) / 100 - 1) * max).toFixed(2)}deg`;
};

function fmtDate(iso: string) {
	const d = new Date(`${iso.slice(0, 10)}T12:00:00`); // local noon: no off-by-one from UTC parsing
	return isNaN(+d) ? iso : d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

export default function Memories() {
	const room = useRoom();
	return room ? (
		<main className="page memories">
			<header className="mem-head">
				<h1>Memories</h1>
				<p className="muted">The movies you're dreaming of, and the nights you've already shared.</p>
			</header>
			<JarSection room={room} />
			<StubWall room={room} />
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

	return (
		<section className="mem-jar-section" aria-labelledby="jar-h">
			<div className="mem-jar-copy">
				<h2 id="jar-h">The watchlist jar</h2>
				<p className="muted">Drop in anything you both want to watch. Can't decide? Give it a shake and let the jar pick tonight's movie.</p>
				<form className="mem-jar-form" onSubmit={add}>
					<label htmlFor="jar-in" className="sr-only">
						Add a movie to the jar
					</label>
					<input
						id="jar-in"
						className="input"
						placeholder="Add a movie to the jar"
						maxLength={LIMITS.title}
						value={title}
						onChange={(e) => setTitle(e.target.value)}
					/>
					<button className="btn" disabled={!title.trim()}>
						Drop it in
					</button>
				</form>
				<button className="btn soft mem-shake" onClick={shake} disabled={!room.jar.length || shaking}>
					Shake the jar!
				</button>
			</div>

			<div className={`mem-jar${shaking ? " shaking" : ""}`}>
				<div className="mem-jar-lid" aria-hidden="true" />
				<div className="mem-jar-body">
					{room.jar.length ? (
						<ul className="mem-slips" aria-label={`${room.jar.length} ${room.jar.length === 1 ? "movie" : "movies"} in the jar`}>
							{room.jar.map((j) => (
								<li key={j.id} className="mem-slip" style={{ "--tilt": tilt(j.id, 6), "--who": profileOf(room, j.addedBy).color } as Vars}>
									<span className="mem-slip-title" title={j.title}>
										{j.title}
									</span>
									<button className="mem-slip-x" aria-label={`Take “${j.title}” out of the jar`} onClick={() => send({ t: "jar:remove", id: j.id })}>
										<Icon name="close" />
									</button>
								</li>
							))}
						</ul>
					) : (
						<div className="mem-jar-empty">
							<Teddy mood="peek" size={88} />
							<p>The jar is empty — drop in a movie you both want to see 🫙</p>
						</div>
					)}
				</div>
				<span className="mem-jar-tag" aria-hidden="true">
					movies ♥
				</span>
			</div>
		</section>
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
	useEffect(() => {
		const d = ref.current;
		if (d && !d.open) d.showModal();
	}, []);
	const by = profileOf(room, pick.by);
	return (
		<dialog ref={ref} className="mem-reveal" onClose={onClose} aria-labelledby="reveal-title">
			<button className="btn icon ghost mem-reveal-x" aria-label="Close" onClick={() => ref.current?.close()}>
				<Icon name="close" />
			</button>
			<Teddy mood="cheer" size={92} accent={by.color} />
			<p className="mem-reveal-kicker">The jar has spoken…</p>
			<div className="mem-reveal-slip">
				<h2 id="reveal-title">{pick.item.title}</h2>
			</div>
			<p className="mem-reveal-by">
				picked by{" "}
				<b className="mem-who" style={{ "--who": by.color } as Vars}>
					{by.name}
				</b>
			</p>
			<div className="mem-reveal-actions">
				<a className="btn" href="#/theater" onClick={() => ref.current?.close()}>
					Let's watch it 🍿
				</a>
				<button className="btn soft" disabled={!room.jar.length} onClick={() => send({ t: "jar:shake" })}>
					Shake again
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
					<button className="btn soft" onClick={() => setAdding(true)}>
						+ New stub
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
						Print stub 🎟️
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
					<Teddy mood="sleep" size={104} />
					<p>No stubs yet — your first movie night will live here 🎟️</p>
				</div>
			)}
		</section>
	);
}

function StubCard({ stub, room }: { stub: Stub; room: RoomState }) {
	const [confirm, setConfirm] = useState(false);
	return (
		<li className="mem-stub-wrap" style={{ "--tilt": tilt(stub.id, 2.2) } as Vars}>
			<article className="mem-stub" aria-label={`Ticket stub: ${stub.title}`}>
				<div className="mem-stub-top">
					<p className="mem-admit">Admit two</p>
					<h3 className="mem-stub-title">{stub.title}</h3>
					<p className="mem-stub-date">
						<time dateTime={stub.date}>{fmtDate(stub.date)}</time>
					</p>
					{confirm ? (
						<div className="mem-stub-confirm" role="group" aria-label="Delete this stub?">
							<span>Tear up this stub?</span>
							<button className="btn sm" onClick={() => send({ t: "stub:delete", id: stub.id })}>
								Tear it up
							</button>
							<button className="btn sm soft" onClick={() => setConfirm(false)}>
								Keep
							</button>
						</div>
					) : (
						<button className="mem-stub-del" aria-label={`Delete the stub for ${stub.title}`} onClick={() => setConfirm(true)}>
							<Icon name="close" />
						</button>
					)}
				</div>
				<div className="mem-stub-bottom">
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
				<Icon key={i} name="heart" filled className={i <= n ? "on" : ""} />
			))}
		</span>
	);
}

function Half({ stub, who, room }: { stub: Stub; who: Who; room: RoomState }) {
	const p = profileOf(room, who);
	const hearts = stub.hearts[who];
	if (hearts === undefined && who === room.you) return <RateForm stub={stub} name={p.name} color={p.color} />;
	return (
		<div className={`mem-half${hearts === undefined ? " pending" : ""}`} style={{ "--who": p.color } as Vars}>
			<p className="mem-half-name">{p.name}</p>
			{hearts === undefined ? (
				<p className="mem-half-wait">Hasn't rated yet… 🧸</p>
			) : (
				<>
					<Hearts n={hearts} />
					{stub.notes[who] && <p className="mem-half-note">“{stub.notes[who]}”</p>}
				</>
			)}
		</div>
	);
}

function RateForm({ stub, name, color }: { stub: Stub; name: string; color: string }) {
	const [hearts, setHearts] = useState(0);
	const [hover, setHover] = useState(0);
	const [note, setNote] = useState("");
	const submit = (e: FormEvent) => {
		e.preventDefault();
		if (hearts) send({ t: "stub:rate", id: stub.id, hearts, note: note.trim() });
	};
	return (
		<form className="mem-half mem-rate" style={{ "--who": color } as Vars} onSubmit={submit}>
			<fieldset className="mem-heart-pick" onMouseLeave={() => setHover(0)}>
				<legend className="mem-half-name">{name} · your hearts</legend>
				{[1, 2, 3, 4, 5].map((n) => (
					<label key={n} className={n <= (hover || hearts) ? "on" : ""} onMouseEnter={() => setHover(n)}>
						<input type="radio" className="sr-only" name={`hearts-${stub.id}`} value={n} checked={hearts === n} onChange={() => setHearts(n)} />
						<Icon name="heart" filled />
						<span className="sr-only">
							{n} {n === 1 ? "heart" : "hearts"}
						</span>
					</label>
				))}
			</fieldset>
			<textarea
				className="input"
				rows={2}
				maxLength={LIMITS.note}
				placeholder="A little note about tonight…"
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
