// Leave a note: letters for the other person, written on the #/note page (src/GiftBuilder.tsx), optionally with a bouquet
// and a box of chocolates. Here: the envelope, the reader, and the toast when one arrives (it opens by itself when they
// next come in, or from the nav badge / the letter box in Memories).
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { EnvelopeSimple, X } from "@phosphor-icons/react";
import { other, type Letter } from "../shared/types";
import { Flower, Head } from "./Character";
import { Envelope, longDate, type Phase } from "./envelope";
export { longDate };
import { profileOf, send, useRoom, type RoomState } from "./room";
import { useCall } from "./rtc";
import { movieOn } from "./Theater";
import "./letters.css";

const GiftLetter = lazy(() => import("./GiftLetter"));

// ---------- one listener owns the reader; anything can ask it to open letters ----------
const opens = new Set<(ids: string[]) => void>();
/** Writing happens on its own page. */
export const writeLetter = () => void (location.hash = "#/note");
export const readLetters = (ids: string[]) => void (ids.length && opens.forEach((f) => f(ids)));
/** Letters written to me that I haven't opened yet, oldest first. */
export const unreadOf = (room: RoomState) => room.letters.filter((l) => l.from !== room.you && !l.openedAt);

const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

let entered = false; // letters waiting when you come in open by themselves, once per page load
const announced = new Set<string>();

/** Mounted once, after the door (inside FaceCams). */
export function LetterListener() {
	const room = useRoom();
	const call = useCall();
	const [open, setOpen] = useState<string[] | null>(null);
	const [toast, setToast] = useState<{ letter: Letter; key: number } | null>(null);

	useEffect(() => {
		const f = (ids: string[]) => {
			setOpen(ids);
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
			if (auto) setOpen((o) => o ?? fresh.map((l) => l.id));
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
					{toast.letter.gift ? <Flower /> : <EnvelopeSimple aria-hidden weight="fill" />}
					<span>
						<b>{them.name}</b> left you {toast.letter.gift ? "a gift" : "a note"}
					</span>
					<button className="btn sm" onClick={() => readLetters([toast.letter.id])}>
						Open
					</button>
					<button className="btn icon ghost sm" aria-label="Dismiss" onClick={() => setToast(null)}>
						<X aria-hidden />
					</button>
				</div>
			)}
			{open && <Reader room={room} ids={open} onClose={() => setOpen(null)} />}
		</>
	);
}

/** A native modal: focus stays inside, Esc closes. */
function useModal(onClose: () => void) {
	const ref = useRef<HTMLDialogElement>(null);
	useEffect(() => {
		const d = ref.current;
		if (d && !d.open) d.showModal();
	}, []);
	return { ref, close: () => ref.current?.close(), onClose };
}

// ---------- reading ----------
function Reader({ room, ids, onClose }: { room: RoomState; ids: string[]; onClose: () => void }) {
	const { ref, close } = useModal(onClose);
	const letters = ids.map((id) => room.letters.find((l) => l.id === id)).filter((l): l is Letter => !!l);
	const [i, setI] = useState(0);
	const letter = letters[Math.min(i, letters.length - 1)];
	const [phase, setPhase] = useState<Phase | "read">(() => (reduced() ? "read" : "closed"));
	const readBtn = useRef<HTMLButtonElement>(null);

	const mine = letter?.from === room.you;
	const unopened = !!letter && !mine && !letter.openedAt;
	const markOpened = () => unopened && send({ t: "letter:open", id: letter.id });
	useEffect(() => {
		if (phase === "read") readBtn.current?.focus();
		if (phase !== "closed" && !letter?.gift) markOpened();
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
	const writeBack = () => {
		close();
		writeLetter();
	};
	const bar = (
		<div className="lt-read-bar">
			{mine ? (
				<span className="lt-status">{letter.openedAt ? `${to.name} opened it on ${longDate(letter.openedAt)}` : `${to.name} hasn't opened it yet`}</span>
			) : (
				<button className="btn blush" onClick={writeBack}>
					<EnvelopeSimple aria-hidden />
					Write back
				</button>
			)}
			<button ref={readBtn} className="btn paper" onClick={more ? next : close}>
				{more ? "Next letter" : "Close"}
			</button>
		</div>
	);
	const what = letter.gift ? "gift" : "note";

	return (
		<dialog ref={ref} className={`lt-dialog${letter.gift ? " lt-wide" : ""}`} aria-label={mine ? `Your ${what} for ${to.name}` : `A ${what} from ${from.name}`} onClose={onClose}>
			<button className="btn ghost icon sm lt-x" aria-label="Close" onClick={close}>
				<X aria-hidden />
			</button>
			{letters.length > 1 && (
				<p className="lt-of">
					{i + 1} of {letters.length}
				</p>
			)}
			{letter.gift ? (
				<Suspense fallback={<p className="lt-hint gs-loading">Opening your gift…</p>}>
					<GiftLetter key={letter.id} room={room} letter={letter} onOpened={markOpened} bar={bar} />
				</Suspense>
			) : phase === "read" ? (
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
					{bar}
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
