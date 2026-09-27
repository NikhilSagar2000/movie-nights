// Leave a note: letters for the other person. Written in a paper dialog, sealed with his flower, and opened as an envelope
// (by itself when they next come in, or from the nav badge / the letter box in Memories).
import { useEffect, useRef, useState, type FormEvent } from "react";
import { EnvelopeSimple, PaperPlaneTilt, X } from "@phosphor-icons/react";
import { LIMITS, PAPERS, other, type Letter, type LetterPaper, type Who } from "../shared/types";
import { Face, Flower, Head } from "./Character";
import { profileOf, send, useRoom, type RoomState } from "./room";
import { useCall } from "./rtc";
import { movieOn } from "./Theater";
import "./letters.css";

// ---------- one listener owns the dialogs; anything can ask it to open one ----------
type Open = { kind: "write" } | { kind: "read"; ids: string[] };
const opens = new Set<(o: Open) => void>();
export const writeLetter = () => opens.forEach((f) => f({ kind: "write" }));
export const readLetters = (ids: string[]) => void (ids.length && opens.forEach((f) => f({ kind: "read", ids })));
/** Letters written to me that I haven't opened yet, oldest first. */
export const unreadOf = (room: RoomState) => room.letters.filter((l) => l.from !== room.you && !l.openedAt);

const PAPER_NAMES: Record<LetterPaper, string> = { cream: "Cream", mist: "Misty blue", blush: "Blush" };
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const longDate = (ms: number) => new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "long" });
const store = {
	get: (k: string) => {
		try {
			return localStorage.getItem(k);
		} catch {
			return null;
		}
	},
	set: (k: string, v: string | null) => {
		try {
			if (v === null) localStorage.removeItem(k);
			else localStorage.setItem(k, v);
		} catch {
			/* no storage: the draft just isn't kept */
		}
	},
};

let entered = false; // letters waiting when you come in open by themselves, once per page load
const announced = new Set<string>();

/** Mounted once, after the door (inside FaceCams). */
export function LetterListener() {
	const room = useRoom();
	const call = useCall();
	const [open, setOpen] = useState<Open | null>(null);
	const [toast, setToast] = useState<{ letter: Letter; key: number } | null>(null);

	useEffect(() => {
		const f = (o: Open) => {
			setOpen(o);
			setToast(null);
		};
		opens.add(f);
		return () => void opens.delete(f);
	}, []);

	const unread = room ? unreadOf(room) : [];
	const unreadKey = unread.map((l) => l.id).join();
	const movie = movieOn(call, room?.tube);
	useEffect(() => {
		const fresh = unread.filter((l) => !announced.has(l.id));
		if (!fresh.length) return;
		const t = setTimeout(() => {
			// set here, not above, so StrictMode's double effect still announces
			fresh.forEach((l) => announced.add(l.id));
			const auto = !entered && !movie;
			entered = true;
			if (auto) setOpen((o) => o ?? { kind: "read", ids: fresh.map((l) => l.id) });
			else setToast({ letter: fresh.at(-1)!, key: Date.now() }); // a live letter never covers the page
		}, 700);
		return () => clearTimeout(t);
	}, [unreadKey]);
	useEffect(() => {
		const t = setTimeout(() => (entered = true), 1500); // nothing waiting at the door: later letters only toast
		return () => clearTimeout(t);
	}, []);
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
				<div className="lt-toast" role="status" key={toast.key}>
					<EnvelopeSimple aria-hidden weight="fill" />
					<span>
						<b>{them.name}</b> left you a note
					</span>
					<button className="btn sm" onClick={() => readLetters([toast.letter.id])}>
						Open
					</button>
					<button className="btn icon ghost sm" aria-label="Dismiss" onClick={() => setToast(null)}>
						<X aria-hidden />
					</button>
				</div>
			)}
			{open?.kind === "write" && <Composer room={room} onClose={() => setOpen(null)} />}
			{open?.kind === "read" && <Reader room={room} ids={open.ids} onClose={() => setOpen(null)} onWrite={() => setOpen({ kind: "write" })} />}
		</>
	);
}

// ---------- the envelope ----------
/** closed: sealed · open: flap up, seal gone · out: the letter slides up · gone: it drops away (you're reading) · fly: sent off */
type Phase = "closed" | "open" | "out" | "gone" | "fly";

function Envelope({ phase, paper, from, to, label, onOpen }: { phase: Phase; paper: LetterPaper; from: Who; to: string; label?: string; onOpen?: () => void }) {
	const body = (
		<>
			<span className="lt-env-back" />
			<span className="lt-env-letter" />
			<span className="lt-env-pocket">
				<span className="lt-env-to">For {to}</span>
				<span className="lt-stamp">
					<Face who={from} s="100%" rw="0" mood="still" />
				</span>
			</span>
			<span className="lt-env-flap" />
			<span className="lt-seal">
				<Flower />
			</span>
		</>
	);
	return onOpen ? (
		<button className={`lt-env ${phase}`} data-paper={paper} aria-label={label} onClick={onOpen}>
			{body}
		</button>
	) : (
		<span className={`lt-env ${phase}`} data-paper={paper} aria-hidden="true">
			{body}
		</span>
	);
}

/** A native modal: focus stays inside, Esc closes. */
function useModal(onClose: () => void) {
	const ref = useRef<HTMLDialogElement>(null);
	useEffect(() => {
		const d = ref.current;
		if (d && !d.open) d.showModal();
	}, []);
	return { ref, close: () => ref.current?.close() };
}

// ---------- writing ----------
function Composer({ room, onClose }: { room: RoomState; onClose: () => void }) {
	const { ref, close } = useModal(onClose);
	const to = profileOf(room, other(room.you));
	const me = profileOf(room, room.you);
	const partnerHere = room.online.some((p) => p.who === other(room.you));
	const [text, setText] = useState(() => store.get("letter-draft") ?? "");
	const [paper, setPaper] = useState<LetterPaper>(() => (PAPERS as string[]).includes(store.get("letter-paper") ?? "") ? (store.get("letter-paper") as LetterPaper) : "cream");
	const [phase, setPhase] = useState<Phase | "done" | null>(null);

	useEffect(() => store.set("letter-draft", text || null), [text]);
	useEffect(() => store.set("letter-paper", paper), [paper]);

	const seal = (e: FormEvent) => {
		e.preventDefault();
		const t = text.trim().slice(0, LIMITS.letter);
		if (!t) return;
		send({ t: "letter:send", text: t, paper });
		setText("");
		store.set("letter-draft", null);
		if (reduced()) return setPhase("done");
		// the letter slides into the envelope, the flap closes, the flower seal stamps it, and off it flies
		setPhase("out");
		const steps: [Phase | "done", number][] = [
			["open", 80],
			["closed", 800],
			["fly", 1900],
			["done", 2800],
		];
		steps.forEach(([p, ms]) => setTimeout(() => setPhase(p), ms));
	};
	useEffect(() => {
		if (phase !== "done") return;
		const t = setTimeout(close, 3200);
		return () => clearTimeout(t);
	}, [phase]);

	return (
		<dialog ref={ref} className="lt-dialog" aria-label={`A note for ${to.name}`} onClose={onClose}>
			{phase === null ? (
				<form className="lt-compose" onSubmit={seal}>
					<div className="lt-paper lt-writing" data-paper={paper}>
						<p className="lt-for">For {to.name}</p>
						<textarea
							className="lt-text"
							value={text}
							maxLength={LIMITS.letter}
							autoFocus
							aria-label={`Your note for ${to.name}`}
							placeholder={`Write something for ${to.name}…`}
							onChange={(e) => setText(e.target.value)}
						/>
						<p className="lt-sign">{me.name}</p>
					</div>
					<div className="lt-compose-bar">
						<fieldset className="lt-papers">
							<legend className="sr-only">Paper</legend>
							{PAPERS.map((p) => (
								<label key={p} className="lt-swatch" data-paper={p} title={PAPER_NAMES[p]}>
									<input type="radio" name="paper" value={p} checked={paper === p} onChange={() => setPaper(p)} />
									<span className="sr-only">{PAPER_NAMES[p]}</span>
								</label>
							))}
						</fieldset>
						<span className="lt-count" aria-live="polite">
							{text.length > LIMITS.letter - 100 ? `${LIMITS.letter - text.length} left` : ""}
						</span>
						<button type="button" className="btn glass" onClick={close}>
							Not now
						</button>
						<button className="btn blush" disabled={!text.trim()}>
							<PaperPlaneTilt aria-hidden />
							Seal &amp; send
						</button>
					</div>
				</form>
			) : phase === "done" ? (
				<div className="lt-sent" role="status">
					<Flower className="lt-sent-flower" />
					<h2>On its way</h2>
					<p>{partnerHere ? `${to.name} is here, it's landing now.` : `${to.name} will find it when they come in.`}</p>
					<button className="btn paper" onClick={close} autoFocus>
						Close
					</button>
				</div>
			) : (
				<div className="lt-scene">
					<Envelope phase={phase} paper={paper} from={room.you} to={to.name} />
				</div>
			)}
		</dialog>
	);
}

// ---------- reading ----------
function Reader({ room, ids, onClose, onWrite }: { room: RoomState; ids: string[]; onClose: () => void; onWrite: () => void }) {
	const { ref, close } = useModal(onClose);
	const letters = ids.map((id) => room.letters.find((l) => l.id === id)).filter((l): l is Letter => !!l);
	const [i, setI] = useState(0);
	const letter = letters[Math.min(i, letters.length - 1)];
	const [phase, setPhase] = useState<Phase | "read">(() => (reduced() ? "read" : "closed"));
	const readBtn = useRef<HTMLButtonElement>(null);

	const mine = letter?.from === room.you;
	const unopened = !!letter && !mine && !letter.openedAt;
	useEffect(() => {
		if (phase === "read") readBtn.current?.focus();
		if (phase !== "closed" && unopened) send({ t: "letter:open", id: letter.id });
	}, [phase]);

	if (!letter) return null;
	const from = profileOf(room, letter.from);
	const to = profileOf(room, other(letter.from));
	const openIt = () => {
		if (phase !== "closed") return;
		setPhase("open");
		setTimeout(() => setPhase("out"), 650);
		setTimeout(() => setPhase("gone"), 1350);
		setTimeout(() => setPhase("read"), 1500);
	};
	const next = () => {
		setI(i + 1);
		setPhase(reduced() ? "read" : "closed");
	};
	const more = i < letters.length - 1;

	return (
		<dialog ref={ref} className="lt-dialog" aria-label={mine ? `Your note for ${to.name}` : `A note from ${from.name}`} onClose={onClose}>
			<button className="btn ghost icon sm lt-x" aria-label="Close" onClick={close}>
				<X aria-hidden />
			</button>
			{letters.length > 1 && (
				<p className="lt-of">
					{i + 1} of {letters.length}
				</p>
			)}
			{phase === "read" ? (
				<div className="lt-reading" key={letter.id}>
					<div className="lt-sheet">
						<span className="lt-peek" aria-hidden="true">
							<Head who={letter.from} moment="arrive" twinkle h="4.6em" />
						</span>
						<div className="lt-paper lt-open" data-paper={letter.paper}>
							<p className="lt-date">{longDate(letter.at)}</p>
							<p className="lt-for">For {to.name}</p>
							<p className="lt-body">{letter.text}</p>
							<p className="lt-sign">{from.name}</p>
						</div>
					</div>
					<div className="lt-read-bar">
						{mine ? (
							<span className="lt-status">{letter.openedAt ? `${to.name} opened it on ${longDate(letter.openedAt)}` : `${to.name} hasn't opened it yet`}</span>
						) : (
							<button className="btn blush" onClick={onWrite}>
								<EnvelopeSimple aria-hidden />
								Write back
							</button>
						)}
						<button ref={readBtn} className="btn paper" onClick={more ? next : close}>
							{more ? "Next letter" : "Close"}
						</button>
					</div>
				</div>
			) : (
				<div className="lt-scene">
					<Envelope
						key={letter.id}
						phase={phase}
						paper={letter.paper}
						from={letter.from}
						to={to.name}
						label={mine ? `Open your note for ${to.name}` : `Open the note from ${from.name}`}
						onOpen={openIt}
					/>
					<p className={`lt-hint${phase === "closed" ? "" : " hide"}`}>{mine ? "Tap to reread it" : `${from.name} left you a note. Tap to open it.`}</p>
				</div>
			)}
		</dialog>
	);
}
