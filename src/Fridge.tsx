// Send a pic: the fridge behind Home's table (your photos on its door, under magnets), the toast when one arrives, and a
// photo held up big. Taking or picking one is its own dialog (PicTaker.tsx, lazy).
import { lazy, Suspense, useEffect, useRef, useState, type CSSProperties } from "react";
import { Camera, DownloadSimple, X } from "@phosphor-icons/react";
import { picFrom, picSlot } from "../shared/pic";
import { other, type Pic } from "../shared/types";
import { Flower } from "./Character";
import { getRoom, profileOf, send, useRoom, type RoomState } from "./room";
import { today } from "./Songs";
import "./fridge.css";

const PicTaker = lazy(() => import("./PicTaker"));
type Vars = CSSProperties & Record<`--${string}`, string | number>;

export const picUrl = (id: string) => `/api/pic/${id}`;

// ---------- one listener owns the dialogs; anything can ask for them ----------
type Ask = { see: string } | { take: true };
const asks = new Set<(a: Ask) => void>();
export const takePic = () => asks.forEach((f) => f({ take: true }));
/** Holds a photo up big. Opening one sent to you is what "seen" means. */
export function seePic(id: string) {
	const room = getRoom();
	const pic = room?.pics.find((p) => p.id === id);
	if (room && pic && pic.from !== room.you && !pic.seenAt) send({ t: "pic:seen", id });
	asks.forEach((f) => f({ see: id }));
}

const announced = new Set<string>(); // photos from them this tab has already said hello to

/** Mounted once, after the door (inside FaceCams), so "See" works from any page. */
export function PicListener() {
	const room = useRoom();
	const [ask, setAsk] = useState<Ask | null>(null);
	const [toast, setToast] = useState<{ pic: Pic; key: number } | null>(null);

	useEffect(() => {
		const f = (a: Ask) => {
			setAsk(a);
			setToast(null);
		};
		asks.add(f);
		return () => void asks.delete(f);
	}, []);

	const waiting = room ? room.pics.filter((p) => p.from !== room.you && !p.seenAt) : [];
	const waitingKey = waiting.map((p) => p.id).join();
	useEffect(() => {
		const fresh = waiting.filter((p) => !announced.has(p.id));
		if (!fresh.length) return;
		const t = setTimeout(() => {
			fresh.forEach((p) => announced.add(p.id)); // here, not above, so StrictMode's double effect still announces
			setToast({ pic: fresh.at(-1)!, key: Date.now() });
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
				<div className="lt-toast fr-toast" role="status" key={toast.key}>
					<Camera aria-hidden weight="fill" />
					<span>
						<b>{them.name}</b> stuck a photo on the fridge
					</span>
					<button className="btn sm" onClick={() => seePic(toast.pic.id)}>
						See
					</button>
					<button className="btn icon ghost sm" aria-label="Dismiss" onClick={() => setToast(null)}>
						<X aria-hidden />
					</button>
				</div>
			)}
			{ask && "see" in ask && <PicView key={ask.see} room={room} id={ask.see} onClose={() => setAsk(null)} />}
			{ask && "take" in ask && (
				<Suspense>
					<PicTaker room={room} onClose={() => setAsk(null)} />
				</Suspense>
			)}
		</>
	);
}

/** A photo held up big, in its polaroid: theirs turns over the first time you open it. */
function PicView({ room, id, onClose }: { room: RoomState; id: string; onClose: () => void }) {
	const ref = useRef<HTMLDialogElement>(null);
	const pic = room.pics.find((p) => p.id === id);
	const [turn] = useState(() => !!pic && pic.from !== room.you && !pic.seenAt);
	const [loaded, setLoaded] = useState(false);
	useEffect(() => {
		if (!ref.current?.open) ref.current?.showModal();
	}, []);
	useEffect(() => {
		if (!pic) ref.current?.close(); // it came down while open (they changed it, or its day ended)
	}, [pic]);
	if (!pic) return null;

	const close = () => ref.current?.close();
	const mine = pic.from === room.you;
	const them = profileOf(room, other(room.you));
	return (
		<dialog
			ref={ref}
			className="fr-view"
			aria-label={mine ? `Your photo for ${them.name}` : `A photo from ${them.name}`}
			onClose={onClose}
			onClick={(e) => e.target === e.currentTarget && close()}
		>
			<figure className={`fr-big${turn ? " turn" : ""}`}>
				<Magnet who={pic.from} />
				<span className={`fr-big-photo${loaded ? " in" : ""}`}>
					<img src={picUrl(pic.id)} alt={pic.note || (mine ? "Your photo" : `A photo from ${them.name}`)} onLoad={() => setLoaded(true)} />
				</span>
				<figcaption>{pic.note}</figcaption>
				{turn && <PicBack className="fr-big-back" />}
			</figure>
			<p className="fr-view-meta">{mine ? (pic.seenAt ? `${them.name} saw it` : `waiting for ${them.name}`) : `from ${them.name}, for today`}</p>
			<div className="fr-view-acts">
				<a className="btn paper sm" href={picUrl(pic.id)} download={`photo-${pic.day}.jpg`}>
					<DownloadSimple aria-hidden weight="bold" />
					Keep a copy
				</a>
				{mine && !pic.seenAt && (
					<button className="btn sm" onClick={takePic}>
						<Camera aria-hidden weight="fill" />
						Change it
					</button>
				)}
			</div>
			<button className="btn ghost icon sm fr-view-x" onClick={close} aria-label="Close">
				<X aria-hidden />
			</button>
		</dialog>
	);
}

/** The back of a polaroid, for you. */
const PicBack = ({ className }: { className?: string }) => (
	<span className={`fr-back ${className ?? ""}`} aria-hidden="true">
		<b>for you</b>
		<svg viewBox="0 0 24 22">
			<path d="M12 20C6 15.6 2 12.2 2 7.6 2 4.4 4.4 2 7.3 2c2 0 3.6 1.1 4.7 2.8C13.1 3.1 14.7 2 16.7 2 19.6 2 22 4.4 22 7.6c0 4.6-4 8-10 12.4Z" />
		</svg>
	</span>
);

/** What holds a photo up: her heart, or his flower. */
const Magnet = ({ who }: { who: Pic["from"] }) =>
	who === "b" ? (
		<svg className="fr-magnet heart" viewBox="0 0 24 22" aria-hidden="true">
			<path d="M12 20C6 15.6 2 12.2 2 7.6 2 4.4 4.4 2 7.3 2c2 0 3.6 1.1 4.7 2.8C13.1 3.1 14.7 2 16.7 2 19.6 2 22 4.4 22 7.6c0 4.6-4 8-10 12.4Z" />
			<ellipse cx="7.6" cy="7" rx="2.2" ry="1.4" />
		</svg>
	) : (
		<Flower className="fr-magnet flower" />
	);

/** Behind Home's table: the fridge. Their photo and yours hang on the door (theirs face down till you open it); the note
 *  on the freezer is how you stick yours up. */
export function Fridge({ room }: { room: RoomState }) {
	const partner = other(room.you);
	const them = profileOf(room, partner);
	const day = today();
	const theirs = picFrom(room.pics, partner, day);
	const mine = picFrom(room.pics, room.you, day);
	const slot = picSlot(room.pics, room.you, day);
	const fresh = !!theirs && !theirs.seenAt;
	return (
		<div className={`fr${fresh ? " new" : ""}`}>
			<FridgeArt />
			<div className="fr-door">
				<span className="fr-xo" aria-hidden="true">
					<i>x</i>
					<i>o</i>
				</span>
				{slot === "locked" ? (
					<span className="fr-memo">
						<i className="fr-memo-pin" aria-hidden="true" />
						<span>{them.name} saw yours</span>
					</span>
				) : (
					<button className="fr-memo" onClick={takePic} aria-label={slot === "new" ? `Stick a photo on the fridge for ${them.name}` : "Change your photo"}>
						<i className="fr-memo-pin" aria-hidden="true" />
						<span aria-hidden="true">{slot === "new" ? "stick a photo" : "change yours"}</span>
					</button>
				)}
				{theirs && <OnFridge key={theirs.id} pic={theirs} side="l" label={`${fresh ? "Open" : "See"} the photo from ${them.name}`} face={!fresh} />}
				{mine && <OnFridge key={mine.id} pic={mine} side="r" label={`See your photo for ${them.name}`} face />}
			</div>
		</div>
	);
}

function OnFridge({ pic, side, label, face }: { pic: Pic; side: "l" | "r"; label: string; face: boolean }) {
	return (
		<button
			className={`fr-pic ${side}${face ? "" : " back"}`}
			onClick={() => seePic(pic.id)}
			aria-label={label}
			style={{ "--tilt": side === "l" ? "-7deg" : "6deg" } as Vars}
		>
			<span className="fr-card">{face ? <img src={picUrl(pic.id)} alt="" /> : <PicBack />}</span>
			<Magnet who={pic.from} />
		</button>
	);
}

/** The fridge, drawn face on: the freezer and the big door (`.fr-door` lies over them) in rounded, glossy enamel, chrome
 *  handles on the right, a kick plate and feet. */
const HANDLES = [
	[22, 34],
	[86, 56],
] as const;
function FridgeArt() {
	return (
		<svg className="fr-art" viewBox="0 0 100 240" aria-hidden="true">
			<defs>
				<linearGradient id="fr-front" x1="0" x2="1">
					<stop offset="0" stopColor="#ecdcbf" />
					<stop offset="0.08" stopColor="#fffcf4" />
					<stop offset="0.5" stopColor="#fff5e0" />
					<stop offset="0.86" stopColor="#f6e7cb" />
					<stop offset="1" stopColor="#e0caa5" />
				</linearGradient>
				<linearGradient id="fr-chrome" x1="0" x2="1">
					<stop offset="0" stopColor="#93a4b8" />
					<stop offset="0.4" stopColor="#5f7186" />
					<stop offset="1" stopColor="#38475a" />
				</linearGradient>
				<linearGradient id="fr-gloss" x1="0" y1="0" x2="1" y2="0">
					<stop offset="0" stopColor="#fff" stopOpacity="0" />
					<stop offset="0.5" stopColor="#fff" stopOpacity="0.55" />
					<stop offset="1" stopColor="#fff" stopOpacity="0" />
				</linearGradient>
				<radialGradient id="fr-floor-g">
					<stop offset="0" stopColor="#2d3a47" stopOpacity="0.32" />
					<stop offset="1" stopColor="#2d3a47" stopOpacity="0" />
				</radialGradient>
			</defs>
			<ellipse cx="50" cy="233" rx="56" ry="7" fill="url(#fr-floor-g)" />
			<rect x="12" y="222" width="14" height="13" rx="3" fill="url(#fr-chrome)" />
			<rect x="74" y="222" width="14" height="13" rx="3" fill="url(#fr-chrome)" />
			<rect className="fr-body" x="2" y="2" width="96" height="228" rx="14" fill="url(#fr-front)" />
			<rect className="fr-bevel" x="8" y="3.2" width="84" height="6" rx="3" />
			<rect className="fr-sheen" x="4.6" y="12" width="2.4" height="196" rx="1.2" />
			{/* enamel gloss: soft streaks across the doors */}
			<path d="M14 78h15L18 205h-6Z" fill="url(#fr-gloss)" opacity="0.7" />
			<path d="M33 78h6L26 205h-5Z" fill="url(#fr-gloss)" opacity="0.6" />
			<path d="M14 9h12l-7 58h-6Z" fill="url(#fr-gloss)" opacity="0.6" />
			<path className="fr-groove" d="M2.6 72H97.4M2.6 211.6H97.4" />
			<path className="fr-lip" d="M2.6 73.7H97.4M2.6 213.3H97.4" />
			<path className="fr-kick" d="M2.4 213.5H97.6V216a14 14 0 0 1-14 14H16.4a14 14 0 0 1-14-14Z" />
			{[35, 45, 55, 65].map((x) => (
				<rect key={x} className="fr-vent" x={x - 3} y="219.5" width="6" height="1.8" rx="0.9" />
			))}
			{HANDLES.map(([y, h]) => (
				<g key={y}>
					<rect className="fr-handle-shadow" x="88.4" y={y + 2.2} width="5" height={h} rx="2.5" />
					<rect className="fr-mount" x="85.4" y={y - 1} width="6.2" height="4" rx="1.4" />
					<rect className="fr-mount" x="85.4" y={y + h - 3} width="6.2" height="4" rx="1.4" />
					<rect x="86" y={y} width="5" height={h} rx="2.5" fill="url(#fr-chrome)" />
					<rect className="fr-handle-light" x="87" y={y + 2.5} width="1.3" height={h - 5} rx="0.65" />
				</g>
			))}
		</svg>
	);
}
