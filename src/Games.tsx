import { lazy, Suspense, useEffect, useState, type ComponentType } from "react";
import { ArrowLeft, ChatCircleSlash, FilmSlate, MusicNotes, type Icon } from "@phosphor-icons/react";
import { other, type Game, type GameKind, type Who } from "../shared/types";
import { getRoom, profileOf, send, useRoom, type RoomState } from "./room";
import { Duo, Face, Head, Loader, type Mood } from "./Character";
import { Away, cls, FullButton, resendPlays, useFull, type Base, type Ctx } from "./games/lead";
import MindMeld from "./games/MindMeld";
import WhoAmIGame, { whoamiInit, whoamiStatus, type WhoAmI } from "./games/WhoAmI";
import DontSayItGame, { tabooInit, tabooStatus, type DontSayIt } from "./games/DontSayIt";
import CharadesGame, { charadesInit, charadesStatus, type Charades } from "./games/Charades";
import EmojiMovieGame, { emojiInit, emojiStatus, type EmojiMovie } from "./games/EmojiMovie";
import AntakshariGame, { antakshariInit, antakshariStatus, type Antakshari } from "./games/Antakshari";
import SameWaveGame, { waveInit, waveStatus, type SameWave } from "./games/SameWave";
import { ludoInit, ludoStatus, turnOf, type Ludo } from "./games/ludoState";
import { bestKey, bestOf, fmt, SOLO_IDS, soloMeta, syncBests, useSoloRoute } from "./arcade";
import { gameOf } from "../shared/bests";
import "./games.css";
import "./arcade/arcade.css";

const Solo = lazy(() => import("./arcade/Solo")); // the solo frame and toolkit load with the first solo game
const LudoGame = lazy(() => import("./games/Ludo")); // the board and its drawing load when a game starts

type Meta = {
	name: string;
	blurb: string;
	hint: string;
	icon?: Icon;
	init: (starter: Who) => unknown;
	View: ComponentType<{ c: Ctx }>;
	/** The line under the title; default "You both play at once". */
	status?: (state: never, you: Who, name: (w: Who) => string) => string;
	/** Lead games: the face shown next to the status is the round's lead. */
	lead?: boolean;
	/** Turn games: whose face goes next to the status. */
	turn?: (state: never) => Who | null;
	/** A wide hub card; "full" spans the whole row. */
	wide?: boolean | "full";
	/** A long game: "All games" asks once before ending it for both. */
	long?: boolean;
};
// Hub order (4 columns): Mind Meld + Who Am I? / Charades + Don't Say It + Emoji Movie / Same Wave + Antakshari / Ludo.
const GAMES: Record<GameKind, Meta> = {
	mindmeld: {
		name: "Mind Meld",
		blurb: "Say a word each until you both say the same one",
		hint: "Round one: say any word. Then both say a word that links your last two, until you say the same one.",
		init: () => null,
		View: MindMeld,
		wide: true,
	},
	whoami: {
		name: "Who Am I?",
		blurb: "One knows a famous face, the other asks and guesses",
		hint: "Ask yes or no questions out loud (or type them). Guess the name when you think you know.",
		init: whoamiInit,
		View: WhoAmIGame,
		status: (s: WhoAmI, you, name) => whoamiStatus(s, you, name),
		lead: true,
		wide: true,
	},
	charades: {
		name: "Dumb Charades",
		blurb: "Act out a movie on camera. No talking!",
		hint: "Act it out with your whole body. No talking, no mouthing the words!",
		icon: FilmSlate,
		init: charadesInit,
		View: CharadesGame,
		status: (s: Charades, you, name) => charadesStatus(s, you, name),
		lead: true,
		wide: true,
	},
	taboo: {
		name: "Don't Say It",
		blurb: "Describe the word without the banned ones",
		hint: "One minute a round. If a banned word slips out, the guesser can buzz.",
		icon: ChatCircleSlash,
		init: tabooInit,
		View: DontSayItGame,
		status: (s: DontSayIt, you, name) => tabooStatus(s, you, name),
		lead: true,
	},
	emoji: {
		name: "Emoji Movie",
		blurb: "Guess the movie or song from emojis",
		hint: "Only emojis get through, so the clue can't spell it out.",
		init: emojiInit,
		View: EmojiMovieGame,
		status: (s: EmojiMovie, you, name) => emojiStatus(s, you, name),
		lead: true,
	},
	wave: {
		name: "Same Wave",
		blurb: "One clue, one dial. How close are your minds?",
		hint: "The closer the needle lands to the secret spot, the more you are on the same wave.",
		init: waveInit,
		View: SameWaveGame,
		status: (s: SameWave, you, name) => waveStatus(s, you, name),
		lead: true,
		wide: true,
	},
	antakshari: {
		name: "Antakshari",
		blurb: "Sing a song that starts where theirs ended",
		hint: "Any language works. Sing at least a line, then pick the letter it ended on.",
		icon: MusicNotes,
		init: antakshariInit,
		View: AntakshariGame,
		status: (s: Antakshari, you, name) => antakshariStatus(s, you, name),
		lead: true,
		wide: true,
	},
	ludo: {
		name: "Ludo",
		blurb: "Race your little heads home. Roll a 6 to get going",
		hint: "A 6, a capture or getting home rolls again. Nobody can be caught on a flower.",
		init: ludoInit,
		View: LudoGame,
		status: (s: Ludo, you, name) => ludoStatus(s, you, name),
		turn: (s: Ludo) => turnOf(s),
		wide: "full",
		long: true,
	},
};
const KINDS = Object.keys(GAMES) as GameKind[];

// ---------- page ----------
export default function Games() {
	const room = useRoom();
	const solo = useSoloRoute();
	// once per connection: bests on this device that the Room hasn't got yet go up
	useEffect(() => {
		const r = getRoom();
		if (r?.connected) syncBests(r);
	}, [room?.connected]);
	if (!room) return null;
	// A game from an older version of the site (or an old open tab) has no screen any more: show the hub.
	const game = room.game && GAMES[room.game.kind] ? room.game : null;
	// a solo game is never cut off by a game for two: it just says one is open
	const live = room.online.some((p) => p.who === other(room.you));
	if (solo)
		return (
			<Suspense
				fallback={
					<main className="page">
						<Loader text="Getting it ready" />
					</main>
				}
			>
				<Solo key={solo} id={solo} you={room.you} waiting={live && game ? GAMES[game.kind].name : undefined} />
			</Suspense>
		);
	return game ? <GameScreen room={room} game={game} /> : <Hub room={room} />;
}

function Hub({ room }: { room: RoomState }) {
	const them = other(room.you);
	const live = room.online.some((p) => p.who === them);
	const partner = profileOf(room, them).name;
	const mood = (w: Who): Mood => (w === them && !live ? "away" : "idle");
	return (
		<main className="page">
			<header className="hub-head">
				<h1>Game corner</h1>
				<p>{live ? "Games for two. Nobody keeps score." : `${partner} is away. Play one on your own till they're back.`}</p>
			</header>
			{/* alone: the solo games come first */}
			{!live && <SoloShelf room={room} first />}
			{!live && <h2 className="ar-h2">Games for two</h2>}
			{!live && <Away who={them} name={partner} />}
			<ul className="hub-grid">
				{KINDS.map((k) => {
					const Ico = GAMES[k].icon;
					return (
						<li key={k} className={cls(GAMES[k].wide && "hub-wide", GAMES[k].wide === "full" && "hub-full")}>
							<button className={`hub-card hub-${k}`} onClick={() => send({ t: "game:new", kind: k, state: GAMES[k].init(room.you) })}>
								{k === "mindmeld" && (
									<>
										<i className="stars" />
										<Duo h="9em" className="hub-duo" a={{ mood: mood("a"), style: { rotate: "8deg" } }} b={{ mood: mood("b"), style: { rotate: "-8deg" } }} />
									</>
								)}
								{k === "whoami" && <Head who={them} mood={live ? "ponder" : "away"} h="9em" className="hub-peek" />}
								{k === "charades" && <Head who={room.you} mood="bob" h="8.5em" className="hub-peek" />}
								{k === "antakshari" && (
									<>
										<i className="stars" />
										<span className="hub-letter" aria-hidden="true">
											अ
										</span>
										<Duo h="8em" className="hub-duo" a={{ mood: mood("a") === "away" ? "away" : "bob" }} b={{ mood: mood("b") === "away" ? "away" : "bob" }} />
									</>
								)}
								{k === "emoji" && (
									<span className="hub-emojis" aria-hidden="true">
										🎬🍿🤔
									</span>
								)}
								{k === "wave" && <MiniDial />}
								{k === "ludo" && <MiniBoard you={room.you} />}
								{Ico && (
									<span className="hub-ico">
										<Ico aria-hidden />
									</span>
								)}
								<span className="hub-name">{GAMES[k].name}</span>
								<span className="hub-blurb">{GAMES[k].blurb}</span>
							</button>
						</li>
					);
				})}
			</ul>
			{live && <SoloShelf room={room} />}
		</main>
	);
}

/** The solo arcade: a card per game with both of your bests (Minesweeper: the small board's). */
function SoloShelf({ room, first }: { room: RoomState; first?: boolean }) {
	const pair: Who[] = [room.you, other(room.you)];
	return (
		<section className={cls("ar-shelf", first && "first")} aria-labelledby="ar-shelf-h">
			<h2 id="ar-shelf-h">On your own</h2>
			<p>Little arcade games for when you're on your own. You can see each other's best.</p>
			<BeatNotes room={room} />
			<ul className="ar-grid">
				{SOLO_IDS.map((id) => {
					const m = soloMeta(id);
					const key = bestKey(id, m.modes?.[0].id);
					const bests = pair.map((w) => ({ w, n: bestOf(room, w, key) })).filter((b) => b.n !== null);
					return (
						<li key={id}>
							<a className="ar-card" data-tone={m.tone} href={`#/games/${id}`}>
								<span className="ar-art" aria-hidden="true">
									{m.art}
								</span>
								{bests.length > 0 && (
									<span className="chip ar-best">
										{m.modes && <span className="ar-best-mode">{m.modes[0].label}</span>}
										{bests.map(({ w, n }) => (
											<span key={w} className="ar-best-one">
												<Face who={w} s="1.35em" ring={profileOf(room, w).color} />
												<span className="sr-only">{w === room.you ? "Your best" : `${profileOf(room, w).name}'s best`}</span>
												{fmt(n!, m.unit)}
											</span>
										))}
									</span>
								)}
								<span className="ar-name">{m.name}</span>
								<span className="ar-blurb">{m.blurb}</span>
							</a>
						</li>
					);
				})}
			</ul>
		</section>
	);
}

/** "They beat your Snake best": notes from the Room, shown until you've seen them. */
function BeatNotes({ room }: { room: RoomState }) {
	const notes = (room.bests?.notes[room.you] ?? []).filter((n) => gameOf(n.key));
	if (!notes.length) return null;
	const seen = () => send({ t: "best:seen" });
	return (
		<div className="ar-notes" role="status">
			<ul>
				{notes.map((n) => {
					const id = gameOf(n.key)!;
					const m = soloMeta(id);
					const size = m.modes?.find((o) => o.id === n.key.split(":")[1])?.label;
					return (
						<li key={n.key}>
							<Face who={n.by} s="2.2em" ring={profileOf(room, n.by).color} />
							<span className="ar-note-text">
								<b>{profileOf(room, n.by).name}</b> beat your {m.name}
								{size ? ` (${size})` : ""} best: <b>{fmt(n.score, m.unit)}</b> (yours was {fmt(n.yours, m.unit)})
							</span>
							<a className="btn sm" href={`#/games/${id}${n.key.includes(":") ? "/" + n.key.split(":")[1] : ""}`} onClick={seen}>
								Try to beat it
							</a>
						</li>
					);
				})}
			</ul>
			<button className="btn sm ghost" onClick={seen}>
				Got it
			</button>
		</div>
	);
}

function GameScreen({ room, game }: { room: RoomState; game: Game }) {
	const you = room.you;
	const them = other(you);
	const partner = room.online.find((p) => p.who === them);
	const round = game.reveals.length;
	const name = (w: Who) => profileOf(room, w).name;
	const meta = GAMES[game.kind];
	const c: Ctx = {
		game,
		you,
		them,
		live: !!partner,
		partnerSid: partner?.sid,
		name,
		color: (w) => profileOf(room, w).color,
		locked: room.sealed?.round === round ? room.sealed.submitted : [],
		seal: (answer) => send({ t: "seal", gameId: game.id, round, answer }),
		again: () => {
			const starter = (game.state as { starter?: Who } | null)?.starter ?? them;
			send({ t: "game:new", kind: game.kind, state: meta.init(other(starter)) });
		},
	};

	// the partner (re)joined: any guess of mine they never got goes again
	useEffect(() => {
		if (meta.lead && partner) resendPlays(game);
	}, [partner?.sid]);
	const turn = meta.turn ? meta.turn(game.state as never) : meta.lead ? ((game.state as Base | null)?.lead ?? null) : null;
	// a long game asks once ("End game?") before "All games" ends it for both
	const [sure, setSure] = useState(false);
	useEffect(() => {
		if (!sure) return;
		const t = setTimeout(() => setSure(false), 3000);
		return () => clearTimeout(t);
	}, [sure]);
	const status = meta.status ? meta.status(game.state as never, you, name) : "You both play at once";
	const [full, toggleFull] = useFull();

	const View = meta.View;
	return (
		<main className={cls("page gm-screen", full)}>
			<div className="gm-top">
				<button className={cls("btn sm gm-back", sure ? "blush" : "paper")} onClick={() => (meta.long && !sure ? setSure(true) : send({ t: "game:end" }))}>
					<ArrowLeft aria-hidden />
					{sure ? "End for both?" : "All games"}
				</button>
				<FullButton full={full} toggle={toggleFull} />
			</div>
			<header className="gm-head">
				<h1 className="gm-title">{meta.name}</h1>
				<p className="chip fog gm-turn" aria-live="polite">
					{turn && <Face who={turn} ring={c.color(turn)} />}
					{status}
				</p>
			</header>
			<div className="gm-players">
				{[you, them].map((w) => (
					<span key={w} className="chip gm-player">
						<Face who={w} ring={c.color(w)} mood={w === them && !c.live ? "away" : "idle"} />
						{w === you ? "You" : name(w)}
					</span>
				))}
			</div>
			{!c.live && <Away who={them} name={name(them)} />}
			<section className="gm-body">
				<Suspense fallback={<Loader text="Setting up the board" />}>
					<View key={game.id} c={c} />
				</Suspense>
				<p className="gm-hint">{meta.hint}</p>
			</section>
			{!c.live && <SoloShelf room={room} />}
		</main>
	);
}

/** The Ludo hub card: a little board with the two of you on it. */
function MiniBoard({ you }: { you: Who }) {
	return (
		<span className="hub-ludo-art" aria-hidden="true">
			<svg viewBox="0 0 15 15">
				<rect className="hub-ludo-paper" width="15" height="15" rx="1" />
				{["rose", "sage", "sun", "sky"].map((c, q) => (
					<g key={c} transform={`rotate(${90 * q} 7.5 7.5)`}>
						<rect className={`hub-ludo-yard ${c}`} x="0.5" y="0.5" width="5.2" height="5.2" rx="1" />
						<rect className="hub-ludo-nest" x="1.4" y="1.4" width="3.4" height="3.4" rx="0.8" />
						<path className={`hub-ludo-yard ${c}`} d="M6.2 6.2 7.5 7.5 6.2 8.8Z" />
						<path className="hub-ludo-lane" d="M0.6 7.5H5.6" />
					</g>
				))}
			</svg>
			<Face who={you} ring="var(--ld-rose-deep)" rw="0.3em" className="hub-ludo-tok one" />
			<Face who={other(you)} ring="var(--ld-sky-deep)" rw="0.3em" className="hub-ludo-tok two" />
			<svg className="hub-ludo-die" viewBox="0 0 10 10">
				<rect x="0.5" y="0.5" width="9" height="9" rx="2.2" />
				{[
					[3, 3],
					[7, 3],
					[5, 5],
					[3, 7],
					[7, 7],
				].map(([x, y]) => (
					<circle key={`${x}${y}`} cx={x} cy={y} r="0.95" />
				))}
			</svg>
		</span>
	);
}

/** The Same Wave hub card's little dial. */
function MiniDial() {
	return (
		<svg className="hub-dial" viewBox="0 0 200 110" aria-hidden="true">
			<path d="M 16 100 A 84 84 0 0 1 184 100" className="hub-dial-track" />
			<path d="M 120.9 18.6 A 84 84 0 0 1 153.5 35.3" className="hub-dial-spot" />
			<line x1="100" y1="100" x2="174" y2="100" className="hub-dial-needle" />
			<circle cx="100" cy="100" r="8" className="hub-dial-hub" />
		</svg>
	);
}
