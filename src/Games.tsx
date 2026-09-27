import { useEffect, type ComponentType } from "react";
import { ArrowLeft, ChatCircleSlash, FilmSlate, MusicNotes, type Icon } from "@phosphor-icons/react";
import { other, type Game, type GameKind, type Who } from "../shared/types";
import { profileOf, send, useRoom, type RoomState } from "./room";
import { Duo, Face, Head, type Mood } from "./Character";
import { Away, cls, resendPlays, type Base, type Ctx } from "./games/lead";
import MindMeld from "./games/MindMeld";
import WhoAmIGame, { whoamiInit, whoamiStatus, type WhoAmI } from "./games/WhoAmI";
import DontSayItGame, { tabooInit, tabooStatus, type DontSayIt } from "./games/DontSayIt";
import CharadesGame, { charadesInit, charadesStatus, type Charades } from "./games/Charades";
import EmojiMovieGame, { emojiInit, emojiStatus, type EmojiMovie } from "./games/EmojiMovie";
import AntakshariGame, { antakshariInit, antakshariStatus, type Antakshari } from "./games/Antakshari";
import SameWaveGame, { waveInit, waveStatus, type SameWave } from "./games/SameWave";
import "./games.css";

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
	/** A wide hub card. */
	wide?: boolean;
};
// Hub order (4 columns): Mind Meld + Who Am I? / Charades + Don't Say It + Emoji Movie / Same Wave + Antakshari.
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
};
const KINDS = Object.keys(GAMES) as GameKind[];

// ---------- page ----------
export default function Games() {
	const room = useRoom();
	if (!room) return null;
	// A game from an older version of the site (or an old open tab) has no screen any more: show the hub.
	return room.game && GAMES[room.game.kind] ? <GameScreen room={room} game={room.game} /> : <Hub room={room} />;
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
				<p>Games for two. Nobody keeps score.</p>
			</header>
			{!live && <Away who={them} name={partner} />}
			<ul className="hub-grid">
				{KINDS.map((k) => {
					const Ico = GAMES[k].icon;
					return (
						<li key={k} className={cls(GAMES[k].wide && "hub-wide")}>
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
		</main>
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
	const turn = meta.lead ? ((game.state as Base | null)?.lead ?? null) : null;
	const status = meta.status ? meta.status(game.state as never, you, name) : "You both play at once";

	const View = meta.View;
	return (
		<main className="page gm-screen">
			<button className="btn paper sm gm-back" onClick={() => send({ t: "game:end" })}>
				<ArrowLeft aria-hidden />
				All games
			</button>
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
				<View key={game.id} c={c} />
				<p className="gm-hint">{meta.hint}</p>
			</section>
		</main>
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
