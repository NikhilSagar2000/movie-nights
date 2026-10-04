import { useEffect, useRef, useState, type CSSProperties } from "react";
import { CoatHanger, EnvelopeSimple, FilmSlate, GameController, HandPointing, House, SignOut, Ticket, X } from "@phosphor-icons/react";
import { other, type Who } from "../shared/types";
import type { Route } from "./main";
import { logout, onRelay, profileOf, useRoom, type RoomState } from "./room";
import { Duo, Face, Flower, lateNight, type HeadProps, type Moment } from "./Character";
import { Envelope } from "./envelope";
import { NameYourLove } from "./Login";
import { readLetters, unreadOf, writeLetter } from "./Letters";
import { sendPoke, usePokeSent } from "./Theater";
import { Garden } from "./Garden";
import { Doodle, TableRadio } from "./Songs";
import { Fridge } from "./Fridge";
import "./home.css";

const LINKS = [
	{ route: "", label: "Home", Icon: House },
	{ route: "theater", label: "Theater", Icon: FilmSlate },
	{ route: "games", label: "Games", Icon: GameController },
	{ route: "memories", label: "Memories", Icon: Ticket },
] as const;

/** The note, dress-up and song pages are rooms of Home: the nav keeps Home lit there. */
const sectionOf = (route: Route): Route => (route === "note" || route === "dress" || route === "song" ? "" : route);

export function Nav({ route }: { route: Route }) {
	const room = useRoom();
	if (!room) return null;
	const section = sectionOf(route);
	const partnerWho = other(room.you);
	const partner = profileOf(room, partnerWho);
	const online = room.online.some((p) => p.who === partnerWho);
	const presence = `${partner.name} is ${online ? "here" : "away"}`;
	const unread = unreadOf(room);

	return (
		<header className="nav">
			<span className="hm-brand">
				<img className="mark" src="/favicon.svg" alt="" />
				<span className="hm-brand-name">Window Seat</span>
			</span>
			<nav className="hm-links" aria-label="Main">
				{LINKS.map(({ route: r, label, Icon }) => (
					<a key={r} href={`#/${r}`} className="hm-link" aria-current={section === r ? (route === r ? "page" : "true") : undefined}>
						<Icon aria-hidden weight={section === r ? "fill" : "regular"} />
						<span className="hm-link-label">{label}</span>
					</a>
				))}
			</nav>
			{unread.length > 0 && (
				<button
					className="btn icon sm hm-mail"
					onClick={() => readLetters(unread.map((l) => l.id))}
					aria-label={`${unread.length} unopened ${unread.length === 1 ? "note" : "notes"} from ${partner.name}`}
					title={`A note from ${partner.name}`}
				>
					<EnvelopeSimple aria-hidden weight="fill" />
					<span className="hm-mail-count">{unread.length}</span>
				</button>
			)}
			<span className="hm-who" title={presence}>
				<Face who={partnerWho} ring={partner.color} s="2em" mood={online ? "still" : "away"} />
				<span className="hm-who-name" aria-hidden="true">
					{partner.name}
				</span>
				<span className={online ? "on-dot" : "on-dot off"} aria-hidden="true" />
				<span className="sr-only">{presence}</span>
			</span>
			<button className="btn icon sm hm-out" onClick={() => void logout()} aria-label="Log out" title="Log out">
				<SignOut aria-hidden />
			</button>
		</header>
	);
}

function RenameDialog({ onClose }: { onClose: () => void }) {
	const ref = useRef<HTMLDialogElement>(null);
	useEffect(() => {
		if (!ref.current?.open) ref.current?.showModal();
	}, []);
	const close = () => ref.current?.close();
	return (
		<dialog ref={ref} className="hm-rename-dialog" aria-label="Rename your love" onClose={onClose} onClick={(e) => e.target === e.currentTarget && close()}>
			<NameYourLove onDone={close} />
			<button className="btn ghost icon sm hm-rename-x" onClick={close} aria-label="Close">
				<X aria-hidden />
			</button>
		</dialog>
	);
}

type Play = { m: Moment | null; n: number };
const side = (w: Who) => (w === "b" ? "l" : "r"); // the Duo draws her (b) on the left, him (a) on the right

export function Home() {
	const room = useRoom();
	const [renaming, setRenaming] = useState(false);
	// one-shot moments on each head: theirs arrives or gets poked, yours gets poked back
	const [them, setThem] = useState<Play>({ m: null, n: 0 });
	const [mine, setMine] = useState<Play>({ m: null, n: 0 });
	const wasOn = useRef<boolean | null>(null);
	const pokeSent = usePokeSent();
	const partnerOn = !!room && room.online.some((p) => p.who === other(room.you));

	// their head pops up when they come online (not on first render)
	useEffect(() => {
		if (wasOn.current === false && partnerOn) setThem((p) => ({ m: "arrive", n: p.n + 1 }));
		wasOn.current = partnerOn;
	}, [partnerOn]);

	// a poke from them squishes your head
	useEffect(
		() =>
			onRelay((_, d) => {
				if (d.k === "nudge" && d.kind === "boop") setMine((p) => ({ m: "squish", n: p.n + 1 }));
			}),
		[],
	);

	if (!room) return null;

	const partnerWho = other(room.you);
	const me = profileOf(room, room.you); // what your partner calls you
	const partner = profileOf(room, partnerWho);
	const isOn = (w: Who) => room.online.some((p) => p.who === w);
	const both = isOn(room.you) && partnerOn;
	const idle = lateNight() ? "drowsy" : "idle";

	// a plant grew while you're looking: you both smile
	const grew = () => {
		setThem((p) => ({ m: "happy", n: p.n + 1 }));
		setMine((p) => ({ m: "happy", n: p.n + 1 }));
	};

	function poke() {
		if (sendPoke()) setThem((p) => ({ m: "squish", n: p.n + 1 }));
	}

	const head = (w: Who, play: Play): Partial<HeadProps> => ({ mood: isOn(w) ? idle : "away", twinkle: true, moment: play.m, nonce: play.n });
	const heads = { [room.you]: head(room.you, mine), [partnerWho]: head(partnerWho, them) } as Record<Who, Partial<HeadProps>>;
	const pop = (play: Play, w: Who) => play.m === "squish" && <Flower key={`${w}${play.n}`} className={`hm-pop ${side(w)}`} />;

	return (
		<main className="page hm-home">
			<div className="hm-sill">
				<div className="arch hm-window">
					<i className="stars" />
					<i className="moon hm-window-moon" />
					<FairyLights on={both} />
					<Duo together={both} a={heads.a} b={heads.b}>
						{pop(them, partnerWho)}
						{pop(mine, room.you)}
						{partnerOn && (
							<button className={`hm-boop ${side(partnerWho)}`} onClick={poke} aria-label={`Poke ${partner.name}`} title={`Poke ${partner.name}`}>
								<span className={`hm-tag poke${pokeSent ? " done" : ""}`} aria-hidden="true">
									<HandPointing weight="fill" />
									<span>{pokeSent ? "poked!" : "poke"}</span>
								</span>
							</button>
						)}
						<a className={`hm-boop hm-dress ${side(room.you)}`} href="#/dress" aria-label="Dress up" title="Dress up">
							<span className="hm-tag dress" aria-hidden="true">
								<CoatHanger weight="bold" />
								<span>dress up</span>
							</span>
						</a>
					</Duo>
					<i className="clouds" />
				</div>
				<Garden pts={room.garden?.pts ?? 0} onGrow={grew} />
			</div>

			<div className="hm-copy">
				<div className="hm-greet">
					<h1>{partnerOn ? "You're both home" : `${partner.name} is away`}</h1>
					{!partnerOn && <p className="hm-lede">The lights come on when they're back.</p>}
				</div>

				<div className="hm-scene">
					<Fridge room={room} />
					<div className="hm-table">
						<div className="hm-things">
							<LetterOnTable room={room} />
							<span className="hm-vase" aria-hidden="true">
								<Flower className="hm-vase-flw" />
								<i className="hm-vase-stem" />
								<i className="hm-vase-glass" />
							</span>
							<TableRadio room={room} />
						</div>
						<TableArt />
					</div>
				</div>

				<p className="hint hm-names">
					{room.profiles[room.you] ? (
						<>
							{partner.name} calls you <b>{me.name}</b>.
						</>
					) : (
						`${partner.name} has not named you yet.`
					)}{" "}
					<button className="hm-rename" onClick={() => setRenaming(true)}>
						Rename {partner.name}
					</button>
				</p>
			</div>

			{renaming && <RenameDialog onClose={() => setRenaming(false)} />}
		</main>
	);
}

type Vars = CSSProperties & Record<`--${string}`, string | number>;

/** Fairy lights strung across the window, in two swags: lit while you're both home. They come on bulb by bulb, left to
 *  right, when they arrive (and on the way in), and go out right to left when they leave. */
const SWAGS = [
	[0, 8, 75, 42, 150, 10],
	[150, 10, 225, 42, 300, 8],
] as const;
const BULBS = [...[0.16, 0.39, 0.62, 0.86].map((t) => [0, t] as const), [1, 0] as const, ...[0.14, 0.38, 0.61, 0.84].map((t) => [1, t] as const)].map(([w, t]) => {
	const [x0, y0, cx, cy, x1, y1] = SWAGS[w];
	const q = (a: number, b: number, c: number) => (1 - t) ** 2 * a + 2 * (1 - t) * t * b + t ** 2 * c;
	return { x: q(x0, cx, x1), y: q(y0, cy, y1) };
});
const HUES = ["var(--flower)", "var(--blush)", "var(--cream)"];

function FairyLights({ on }: { on: boolean }) {
	// start dark and switch on a moment later, so coming in (or their arrival) plays the bulbs lighting in turn
	const [lit, setLit] = useState(false);
	useEffect(() => {
		const t = setTimeout(() => setLit(on), on ? 450 : 0);
		return () => clearTimeout(t);
	}, [on]);
	return (
		<svg className={`hm-lights${lit ? " on" : ""}`} viewBox="0 0 300 62" aria-hidden="true">
			<path className="hm-wire" d="M0 8 Q75 42 150 10 Q225 42 300 8" />
			{BULBS.map(({ x, y }, i) => (
				<g key={i} className="hm-bulb" style={{ "--i": i, "--hue": HUES[i % HUES.length] } as Vars} transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`}>
					<rect className="hm-cap" x="-1.6" y="0" width="3.2" height="3" rx="0.8" />
					<g className="hm-glow">
						<circle cx="0" cy="8" r="8.5" />
					</g>
					<ellipse className="hm-glass" cx="0" cy="7.6" rx="3.2" ry="4.4" />
				</g>
			))}
		</svg>
	);
}

/** The little table: a gingham cloth with a lace edge, slate legs, a soft shadow on the floor. */
const SCALLOPS = Array.from({ length: 14 }, () => "a14 9 0 0 1 -28 0").join(" ");
function TableArt() {
	return (
		<svg className="hm-table-art" viewBox="0 0 400 150" aria-hidden="true">
			<defs>
				<pattern id="hm-gingham" width="14" height="14" patternUnits="userSpaceOnUse">
					<rect width="14" height="14" fill="#fff7e6" />
					<rect width="7" height="14" fill="#f7c8d3" fillOpacity="0.55" />
					<rect width="14" height="7" fill="#f7c8d3" fillOpacity="0.55" />
				</pattern>
			</defs>
			<ellipse className="hm-floor" cx="200" cy="144" rx="168" ry="5" />
			<path className="hm-leg" d="M60 50 66 136h12l-2-86Z" />
			<path className="hm-leg" d="M340 50l-6 86h-12l2-86Z" />
			<rect className="hm-foot" x="62" y="134" width="20" height="5" rx="2.5" />
			<rect className="hm-foot" x="318" y="134" width="20" height="5" rx="2.5" />
			<rect className="hm-top" x="6" y="2" width="388" height="16" rx="7" fill="url(#hm-gingham)" />
			<rect className="hm-top-light" x="6" y="2" width="388" height="16" rx="7" />
			<path className="hm-cloth" d={`M4 13H396V48${SCALLOPS}V13Z`} fill="url(#hm-gingham)" />
			<path className="hm-lace" d={`M396 48${SCALLOPS}`} />
			<path className="hm-hem" d="M4 14H396" />
		</svg>
	);
}

/** The letter on the table: theirs waiting to be opened (that comes first), yours waiting for them, or a blank one
 *  asking for a note. The one place on Home to read or write one (the reader has "Write back"). */
function LetterOnTable({ room }: { room: RoomState }) {
	const partner = other(room.you);
	const them = profileOf(room, partner);
	const unread = unreadOf(room);
	const waiting = room.letters.filter((l) => l.from === room.you && !l.openedAt);
	const latest = unread.at(-1) ?? waiting.at(-1);
	const n = unread.length;
	const caption = n
		? n > 1
			? `${n} notes from ${them.name}!`
			: `a ${unread[0].gift ? "gift" : "note"} from ${them.name}!`
		: waiting.length
			? "waiting to be read"
			: "leave a note";
	return (
		<div className={`hm-thing hm-letter-thing${n ? " new" : ""}`}>
			<p className="hm-cap">
				<span>{caption}</span>
			</p>
			<Doodle />
			<button
				className="hm-letter"
				onClick={() => (n ? readLetters(unread.map((l) => l.id)) : writeLetter())}
				aria-label={n ? `Open ${n > 1 ? `${n} notes` : "the note"} from ${them.name}` : `Write ${them.name} a note`}
			>
				<span className="hm-letter-lie">
					<Envelope phase="closed" paper={latest?.paper ?? "cream"} from={n ? partner : room.you} to={n ? profileOf(room, room.you).name : them.name} />
				</span>
				{n > 1 && <b className="hm-env-count">{n}</b>}
			</button>
		</div>
	);
}
