import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowsClockwise, Cards, CirclesFour, Eraser, HandFist, HandPalm, HandPeace, Hash, Question, ScribbleLoop, type Icon } from "@phosphor-icons/react";
import { LIMITS, other, type Game, type GameKind, type Stroke, type Who } from "../shared/types";
import { getRoom, onRelay, profileOf, relay, send, useRoom, type RoomState } from "./room";
import { Duo, Face, Flower, FlowerBurst, FlowerRain, Head, type HeadProps, type Mood } from "./Character";
import * as L from "./gameLogic";
import "./games.css";

// ---------- small helpers ----------
const cls = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(" ");
const vars = (o: Record<string, string | number>) => o as CSSProperties;
const ss = {
	get: (k: string) => {
		try {
			return sessionStorage.getItem(k);
		} catch {
			return null;
		}
	},
	set: (k: string, v: string) => {
		try {
			sessionStorage.setItem(k, v);
		} catch {
			/* private mode: the word/drawing just won't survive a refresh */
		}
	},
};

/** Everything a game view needs about the room and the current game. */
type Ctx = {
	game: Game;
	you: Who;
	them: Who;
	/** Partner is here; moves are disabled otherwise. */
	live: boolean;
	partnerSid?: string;
	name: (w: Who) => string;
	color: (w: Who) => string;
	/** Send a full next state (no-op for null/illegal moves, and at most one send per received state). */
	move: (next: unknown) => void;
	/** A move of mine is on its way; boards stay disabled until the Room echoes it (so taps aren't silently dropped). */
	busy: boolean;
	/** Who has locked in for the current sealed round. */
	locked: Who[];
	seal: (answer: string) => void;
	again: () => void;
};

type Meta = { name: string; blurb: string; hint: string; icon?: Icon; init: (starter: Who) => unknown; turnBased?: boolean };
// Hub order: Mind Meld leads (wide night card), Doodle closes (wide dotted card).
const GAMES: Record<GameKind, Meta> = {
	mindmeld: {
		name: "Mind Meld",
		blurb: "Say a word each until you both say the same one",
		hint: "Round one: say any word. Then both say a word that links your last two, until you say the same one.",
		init: () => null,
	},
	ttt: { name: "Tic-tac-toe", blurb: "Three in a row", hint: "Tap a square. Three in a row wins.", icon: Hash, init: L.tttInit, turnBased: true },
	c4: { name: "Connect Four", blurb: "Four in a line", hint: "Tap a column to drop your piece", icon: CirclesFour, init: L.c4Init, turnBased: true },
	memory: { name: "Memory match", blurb: "Find the pairs together", hint: "Find a pair and you go again", icon: Cards, init: (s) => L.memoryInit(s), turnBased: true },
	rps: { name: "Rock paper scissors", blurb: "Choose in secret", hint: "Nothing shows until you have both picked", icon: HandFist, init: () => null },
	doodle: { name: "Doodle and guess", blurb: "One draws, the other guesses", hint: "Guess it right and you swap", icon: ScribbleLoop, init: L.doodleInit },
};
const KINDS = Object.keys(GAMES) as GameKind[];
/** Her on the left, him on the right, the same as the Duo. */
const SEATS: Who[] = ["b", "a"];

/** Whose move it is right now, or null when finished / both play at once. */
function turnOf(g: Game): Who | null {
	const s = g.state as L.Grid & L.Memory & L.Doodle;
	if (g.kind === "ttt") return L.tttWinner(s.board) ? null : s.turn;
	if (g.kind === "c4") return L.c4Winner(s.board) ? null : s.turn;
	if (g.kind === "memory") return L.memoryDone(s) ? null : s.turn;
	if (g.kind === "doodle") return s.drawer;
	return null;
}

// ---------- page ----------
export default function Games() {
	const room = useRoom();
	if (!room) return null;
	return room.game ? <GameScreen room={room} game={room.game} /> : <Hub room={room} />;
}

function Away({ who, name }: { who: Who; name: string }) {
	return (
		<div className="gm-away" role="status">
			<span className="gm-away-peek">
				<Head who={who} mood="away" h="4.4em" />
			</span>
			<p>
				<b>{name} is away right now.</b> Games wait until you are both here.
			</p>
		</div>
	);
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
				<p>Six little games. Nobody keeps score.</p>
			</header>
			{!live && <Away who={them} name={partner} />}
			<ul className="hub-grid">
				{KINDS.map((k) => {
					const Ico = GAMES[k].icon;
					return (
						<li key={k} className={cls((k === "mindmeld" || k === "doodle") && "hub-wide")}>
							<button className={`hub-card hub-${k}`} onClick={() => send({ t: "game:new", kind: k, state: GAMES[k].init(room.you) })}>
								{k === "mindmeld" && (
									<>
										<i className="stars" />
										<Duo h="9em" className="hub-duo" a={{ mood: mood("a"), style: { rotate: "8deg" } }} b={{ mood: mood("b"), style: { rotate: "-8deg" } }} />
									</>
								)}
								{k === "doodle" && <Head who={them} mood={live ? "bob" : "away"} h="9em" className="hub-peek" />}
								{Ico && (
									<span className="hub-ico">
										<Ico aria-hidden />
									</span>
								)}
								{k === "ttt" && live && <span className="chip sage hub-here">{partner} is here</span>}
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
	const sentFor = useRef<unknown>(undefined);
	const [pendingFor, setPendingFor] = useState<unknown>(undefined);
	const round = game.reveals.length;
	const name = (w: Who) => profileOf(room, w).name;
	const c: Ctx = {
		game,
		you,
		them,
		live: !!partner,
		partnerSid: partner?.sid,
		name,
		color: (w) => profileOf(room, w).color,
		move: (next) => {
			// One send per received state: a fast double tap can't overwrite the partner's reply with a stale board.
			if (!next || sentFor.current === game.state) return;
			sentFor.current = game.state;
			setPendingFor(game.state);
			send({ t: "game:state", id: game.id, state: next });
		},
		busy: pendingFor === game.state,
		locked: room.sealed?.round === round ? room.sealed.submitted : [],
		seal: (answer) => send({ t: "seal", gameId: game.id, round, answer }),
		again: () => {
			const starter = (game.state as { starter?: Who } | null)?.starter ?? them;
			send({ t: "game:new", kind: game.kind, state: GAMES[game.kind].init(other(starter)) });
		},
	};

	const turn = turnOf(game);
	const status =
		game.kind === "doodle"
			? turn === you
				? "You are drawing"
				: `${name(them)} is drawing`
			: turn
				? turn === you
					? "Your turn"
					: `${name(turn)}'s turn`
				: GAMES[game.kind].turnBased
					? "All done"
					: "You both play at once";

	const View = { ttt: TicTacToe, c4: ConnectFour, memory: MemoryGame, rps: Rps, mindmeld: MindMeld, doodle: DoodleGame }[game.kind];
	return (
		<main className="page gm-screen">
			<button className="btn paper sm gm-back" onClick={() => send({ t: "game:end" })}>
				<ArrowLeft aria-hidden />
				All games
			</button>
			<header className="gm-head">
				<h1 className="gm-title">{GAMES[game.kind].name}</h1>
				<p className={cls("chip fog gm-turn", turn === you && "mine")} aria-live="polite">
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
				<p className="gm-hint">{GAMES[game.kind].hint}</p>
			</section>
		</main>
	);
}

// ---------- shared pieces ----------
/** "You" for you, their name for them. */
const who = (c: Ctx, w: Who) => (w === c.you ? "You" : c.name(w));

/** A player's piece: their little face in their ring color. The heads differ, so it reads even when both picked the same color. */
function Token({ c, who }: { c: Ctx; who: Who }) {
	return <Face who={who} ring={c.color(who)} mood="still" className="gm-tok" />;
}

/** Flowers fall across the screen for a few seconds. Portaled so an animated ancestor can't trap the fixed flowers. */
function Rain() {
	const [on, setOn] = useState(true);
	useEffect(() => {
		const t = setTimeout(() => setOn(false), 5000);
		return () => clearTimeout(t);
	}, []);
	return on
		? createPortal(
				<div className="gm-rain" aria-hidden="true">
					<FlowerRain count={14} />
				</div>,
				document.body,
			)
		: null;
}

/** True for a moment after `key` changes (never on first render). */
function useBurst(key: unknown, ms = 2800) {
	const seen = useRef(key);
	const [on, setOn] = useState(false);
	useEffect(() => {
		if (Object.is(seen.current, key)) return;
		seen.current = key;
		setOn(true);
		const t = setTimeout(() => setOn(false), ms);
		return () => clearTimeout(t);
	}, [key, ms]);
	return on;
}

/** Finished board: the winner hops, the other goes aww (a tie or a team win: both hop, leaning in), flowers fall. */
function Finish({ c, winner, text }: { c: Ctx; winner: Who | null; text: string }) {
	const mood = (w: Who): Mood => (!winner || w === winner ? "hop" : "aww");
	return (
		<div className="gm-done" role="status">
			<Rain />
			<span className="gm-done-heads">
				<Duo h="7em" together={!winner} className="gm-duo" a={{ mood: mood("a") }} b={{ mood: mood("b") }} />
			</span>
			<div className="gm-done-copy">
				<h2>{text}</h2>
				<button className="btn" onClick={c.again}>
					Play again
				</button>
			</div>
		</div>
	);
}

function outcomeText(c: Ctx, out: L.Outcome) {
	if (out === "draw") return "A tie. Perfectly matched.";
	if (!out) return "";
	return out.who === c.you ? "You win!" : `${c.name(out.who)} wins!`;
}

const cellName = (c: Ctx, cell: L.Cell) => (cell ? (cell === c.you ? "your piece" : `${c.name(cell)}'s piece`) : "empty");

// ---------- tic-tac-toe ----------
function TicTacToe({ c }: { c: Ctx }) {
	const s = c.game.state as L.Grid;
	const out = L.tttWinner(s.board);
	const win = out && out !== "draw" ? out.line : [];
	const canMove = c.live && !c.busy && !out && s.turn === c.you;
	return (
		<>
			{out && <Finish c={c} winner={out === "draw" ? null : out.who} text={outcomeText(c, out)} />}
			<div className="ttt" role="group" aria-label="Tic-tac-toe board">
				{s.board.map((cell, i) => (
					<button
						key={i}
						className={cls("ttt-cell", win.includes(i) && "win")}
						disabled={!canMove || !!cell}
						onClick={() => c.move(L.tttMove(s, i, c.you))}
						aria-label={`Row ${Math.floor(i / 3) + 1}, column ${(i % 3) + 1}: ${cellName(c, cell)}`}
					>
						{cell && <Token c={c} who={cell} />}
					</button>
				))}
			</div>
		</>
	);
}

// ---------- connect four ----------
function ConnectFour({ c }: { c: Ctx }) {
	const s = c.game.state as L.Grid;
	const out = L.c4Winner(s.board);
	const win = out && out !== "draw" ? out.line : [];
	const canMove = c.live && !c.busy && !out && s.turn === c.you;
	// Same ring color for both: her discs get a cream inner ring so the two sets still differ.
	const twin = (w: Who) => w === "b" && c.color("a") === c.color("b");
	// The state doesn't record the newest disc, so compare with the board we saw before (none after a refresh).
	const [prev, setPrev] = useState(s.board);
	const [last, setLast] = useState(-1);
	if (prev !== s.board) {
		setPrev(s.board);
		setLast(s.board.findIndex((v, i) => v && !prev[i]));
	}
	return (
		<>
			{out && <Finish c={c} winner={out === "draw" ? null : out.who} text={outcomeText(c, out)} />}
			<div className="c4" role="group" aria-label="Connect Four board">
				{Array.from({ length: L.C4_COLS }, (_, col) => (
					<button
						key={col}
						className="c4-col"
						disabled={!canMove || s.board[col] !== null}
						onClick={() => c.move(L.c4Move(s, col, c.you))}
						aria-label={`Drop in column ${col + 1}`}
						style={canMove ? vars({ "--who": c.color(c.you) }) : undefined}
					>
						<span className={cls("c4-ghost", twin(c.you) && "twin")} aria-hidden="true" />
						{Array.from({ length: L.C4_ROWS }, (_, row) => {
							const i = row * L.C4_COLS + col;
							const cell = s.board[i];
							return (
								<span key={row} className={cls("c4-hole", win.includes(i) && "win")}>
									{cell && <span className={cls("c4-piece", twin(cell) && "twin", i === last && !out && "last")} style={vars({ "--row": row, "--p": c.color(cell) })} />}
								</span>
							);
						})}
					</button>
				))}
			</div>
		</>
	);
}

// ---------- memory match ----------
function MemoryGame({ c }: { c: Ctx }) {
	const s = c.game.state as L.Memory;
	const done = L.memoryDone(s);
	const canMove = c.live && !c.busy && !done && s.turn === c.you && s.up.length < 2;

	// After a miss, the mover's client flips both cards back and passes the turn. If the mover left the page, the
	// partner's client does it a little later (same state in, same state out, so both sending is harmless).
	const { move, you } = c;
	useEffect(() => {
		if (s.up.length !== 2) return;
		const t = setTimeout(() => move(L.memoryFlipBack(s)), s.turn === you ? 900 : 2500);
		return () => clearTimeout(t);
	}, [s, you]); // only a new state restarts the timer

	return (
		<>
			{done && <Finish c={c} winner={null} text="Every pair found. What a team." />}
			<div className="mg" role="group" aria-label="Memory cards">
				{s.deck.map((face, i) => {
					const owner = s.found[i];
					const up = !!owner || s.up.includes(i);
					return (
						<button
							key={i}
							className={cls("mg-card", up && "up", owner && "found")}
							style={owner ? vars({ "--who": c.color(owner) }) : undefined}
							disabled={!canMove || up}
							onClick={() => c.move(L.memoryFlip(s, i, c.you))}
							aria-label={up ? `${face}${owner ? `, found by ${owner === c.you ? "you" : c.name(owner)}` : ""}` : "Face-down card"}
						>
							<span className="mg-inner">
								<span className="mg-back">
									<Flower />
								</span>
								<span className="mg-front">
									<span className="mg-face">{face}</span>
									{owner && <Token c={c} who={owner} />}
								</span>
							</span>
						</button>
					);
				})}
			</div>
		</>
	);
}

// ---------- rock paper scissors ----------
const HAND_ICON: Record<string, Icon> = { rock: HandFist, paper: HandPalm, scissors: HandPeace };

function Rps({ c }: { c: Ctx }) {
	const { reveals } = c.game;
	const last = reveals.at(-1);
	const [again, setAgain] = useState(false);
	const [count, setCount] = useState(0); // 3, 2, 1 while the fists shake
	const [mine, setMine] = useState("");
	const seen = useRef(reveals.length);

	useEffect(() => {
		if (reveals.length === seen.current) return;
		seen.current = reveals.length;
		setAgain(false);
		setMine("");
		setCount(3);
	}, [reveals.length]);
	useEffect(() => {
		if (!count) return;
		const t = setTimeout(() => setCount(count - 1), 520);
		return () => clearTimeout(t);
	}, [count]);

	const iLocked = c.locked.includes(c.you);
	const theyLocked = c.locked.includes(c.them);
	const theirLock = theyLocked && <p className="chip sage gm-lock">{c.name(c.them)} is locked in</p>;

	// Same order as before: countdown, then my sealed pick, then the reveal, then choosing.
	const phase = count ? "count" : iLocked ? "locked" : last && !again ? "reveal" : "choose";
	const r = phase === "reveal" && last ? L.rpsResult(last.a, last.b) : null;
	// Both ponder; whoever has sealed nods (their pick stays secret). The reveal: the winner hops, the other goes aww.
	const mood = (w: Who): Mood => {
		if (w === c.them && !c.live) return "away";
		if (phase === "count") return "bob";
		if (r) return r === "tie" || r === w ? "hop" : "aww";
		return c.locked.includes(w) ? "nod" : "ponder";
	};
	const hand = (w: Who): Icon | null => {
		if (phase === "count") return HandFist;
		if (r && last) return HAND_ICON[last[w]] ?? Question;
		return w === c.you && iLocked && mine ? HAND_ICON[mine] : null; // the partner's pick stays hidden
	};
	const seat = (w: Who) => {
		const H = hand(w);
		return (
			<figure key={w} className="rps-seat" style={vars({ "--who": c.color(w) })}>
				<Head who={w} mood={mood(w)} h="6.5em" />
				<span className={cls("rps-hand", !H && "empty", w === "a" && "flip", phase === "count" && "shake", r === w && "won")}>{H && <H aria-hidden weight="duotone" />}</span>
				<figcaption>{who(c, w)}</figcaption>
			</figure>
		);
	};

	return (
		<div className="rps">
			<div className="rps-table">
				{seat(SEATS[0])}
				{count ? (
					<span key={count} className="rps-count" aria-live="assertive">
						{count}
					</span>
				) : (
					<span className="rps-vs" aria-hidden="true">
						vs
					</span>
				)}
				{seat(SEATS[1])}
				{r && <FlowerBurst />}
			</div>

			{phase === "locked" && (
				<p className="gm-say">
					{mine ? `You picked ${mine}.` : "You are locked in."} Waiting for {c.name(c.them)}.
				</p>
			)}

			{phase === "reveal" && r && (
				<>
					<h2 className="gm-say big">{r === "tie" ? "Same pick. Great minds." : r === c.you ? "You win this one!" : `${c.name(r)} wins this one!`}</h2>
					<button className="btn" onClick={() => setAgain(true)}>
						Again
					</button>
				</>
			)}

			{phase === "choose" && (
				<div className="rps-choices">
					{L.HANDS.map((h) => {
						const H = HAND_ICON[h];
						return (
							<button
								key={h}
								className="rps-choice"
								disabled={!c.live}
								onClick={() => {
									setMine(h);
									c.seal(h);
								}}
							>
								<span className="rps-icon" aria-hidden="true">
									<H />
								</span>
								{h}
							</button>
						);
					})}
				</div>
			)}
			{phase !== "count" && theirLock}
		</div>
	);
}

// ---------- mind meld ----------
function MindMeld({ c }: { c: Ctx }) {
	const rv = c.game.reveals;
	const last = rv.at(-1);
	const synced = !!last && L.mindMeldMatch(last.a, last.b);
	const [text, setText] = useState("");
	const [mine, setMine] = useState("");
	const iLocked = c.locked.includes(c.you);
	const theyLocked = c.locked.includes(c.them);
	useEffect(() => setMine(""), [rv.length]);

	const submit = (e: FormEvent) => {
		e.preventDefault();
		const w = text.trim();
		if (!w || iLocked || !c.live) return;
		c.seal(w);
		setMine(w);
		setText("");
	};

	// Thinking: both ponder, whoever has sealed nods. Same brain: they bump heads and flowers burst.
	const head = (w: Who): Partial<HeadProps> => ({
		mood: w === c.them && !c.live ? "away" : synced ? "idle" : c.locked.includes(w) ? "nod" : "ponder",
		moment: synced ? (w === "b" ? "bump-l" : "bump-r") : null,
	});

	return (
		<div className="mm">
			<div className="mm-sky">
				<i className="stars" />
				{synced ? (
					<div className="mm-win" role="status">
						<h2>Same brain</h2>
						<p>
							You matched in {rv.length} {rv.length === 1 ? "round" : "rounds"}.
						</p>
						<button className="btn paper" onClick={c.again}>
							Play again
						</button>
					</div>
				) : (
					<p className="mm-say" aria-live="polite">
						{iLocked ? (
							<>
								{mine ? (
									<>
										You said <b>{mine}</b>.
									</>
								) : (
									"You are locked in."
								)}{" "}
								Waiting for {c.name(c.them)}.
							</>
						) : theyLocked ? (
							`${c.name(c.them)} is locked in. Your turn.`
						) : (
							"You are both thinking"
						)}
					</p>
				)}
				<Duo h="9em" className="gm-duo mm-duo" a={head("a")} b={head("b")}>
					{synced && <FlowerBurst />}
				</Duo>
			</div>

			{rv.length > 0 && (
				<ol className="mm-chain" aria-label="Your words so far">
					{rv.map((r, i) => (
						<li key={i} className={cls("mm-pair", synced && i === rv.length - 1 && "same")}>
							<span className="mm-word" style={vars({ "--who": c.color("b") })}>
								{r.b}
							</span>
							<Flower className="mm-link" />
							<span className="mm-word" style={vars({ "--who": c.color("a") })}>
								{r.a}
							</span>
						</li>
					))}
				</ol>
			)}

			{!synced && !iLocked && (
				<form className="mm-form" onSubmit={submit}>
					<label htmlFor="mm-word">
						{last ? (
							<>
								A word that links <b>{last[c.you]}</b> and <b>{last[c.them]}</b>
							</>
						) : (
							"Say any word to start"
						)}
					</label>
					<div className="mm-row">
						<input
							id="mm-word"
							className="input"
							value={text}
							maxLength={LIMITS.answer}
							autoComplete="off"
							placeholder="One word or a tiny phrase"
							disabled={!c.live}
							onChange={(e) => setText(e.target.value)}
						/>
						<button className="btn" disabled={!text.trim() || !c.live}>
							Lock in
						</button>
					</div>
				</form>
			)}
		</div>
	);
}

// ---------- doodle & guess ----------
// Stroke colors are drawing data sent to the partner (not UI styling), so a sun can be yellow and grass green.
const INKS = [
	["Night", "#2d3a47"],
	["Dusk", "#52657a"],
	["Rosewood", "#b46a72"],
	["Sage", "#7d8c55"],
	["Honey", "#e0a526"],
	["Sky", "#5e93cc"],
] as const;
const SIZES = [0.008, 0.018, 0.04]; // fraction of canvas width, so a drawing looks the same on every screen

// Strokes live at module level (keyed by game+round) and the relay listener stays subscribed while the app runs,
// so the guesser never misses ink while on another page, and the drawer's drawing survives a page switch.
let ink = { key: "", strokes: [] as Stroke[] };
const inkSubs = new Set<(added: Stroke[] | null) => void>(); // null = cleared
const inkKeyOf = (g: Game) => `${g.id}:${(g.state as L.Doodle).round}`;
function inkOf(key: string) {
	if (ink.key !== key) {
		let saved: Stroke[] = [];
		try {
			saved = JSON.parse(ss.get(`${key}:ink`) ?? "[]");
		} catch {
			/* ignore a corrupt cache */
		}
		ink = { key, strokes: saved };
	}
	return ink.strokes;
}
function addInk(key: string, strokes: Stroke[] | null) {
	if (strokes) inkOf(key).push(...strokes);
	else ink = { key, strokes: [] };
	inkSubs.forEach((f) => f(strokes));
}
const saveInk = (key: string) => ss.set(`${key}:ink`, JSON.stringify(inkOf(key)));

const stopInk = onRelay((from, d) => {
	const room = getRoom();
	const g = room?.game;
	if (!room || g?.kind !== "doodle") return;
	const s = g.state as L.Doodle;
	// The drawer checks guesses here, not in the page, so a guess still counts while the drawer is on another page.
	if (d.k === "doodle:guess" && s.drawer === room.you && typeof d.text === "string") {
		const word = ss.get(inkKeyOf(g));
		if (word && L.guessMatches(d.text, word)) {
			send({ t: "game:state", id: g.id, state: L.doodleSolved(s, word, from) });
			relay({ k: "doodle:clear" });
		}
		return;
	}
	if (from !== s.drawer) return; // only ink from the current drawer
	if (d.k === "doodle" && Array.isArray(d.strokes)) addInk(inkKeyOf(g), d.strokes);
	else if (d.k === "doodle:clear") addInk(inkKeyOf(g), null);
});
import.meta.hot?.dispose(stopInk);

function drawStroke(ctx: CanvasRenderingContext2D, s: Stroke, w: number, h: number) {
	if (!s.x?.length) return;
	ctx.strokeStyle = s.color;
	ctx.lineWidth = s.size * w;
	ctx.lineCap = "round";
	ctx.lineJoin = "round";
	ctx.beginPath();
	ctx.moveTo(s.x[0] * w, s.y[0] * h);
	for (let i = 1; i < s.x.length; i++) ctx.lineTo(s.x[i] * w, s.y[i] * h);
	if (s.x.length === 1) ctx.lineTo(s.x[0] * w + 0.1, s.y[0] * h); // a tap draws a dot
	ctx.stroke();
}

const clamp01 = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 1000) / 1000;

/** 4:3 canvas painted from the ink store; the drawer's pointer strokes are relayed in ~50ms batches. */
function DoodleCanvas({ inkKey, canDraw, color, size, children }: { inkKey: string; canDraw: boolean; color: string; size: number; children?: ReactNode }) {
	const ref = useRef<HTMLCanvasElement>(null);
	const live = useRef<{ id: number; s: Stroke; sent: number } | null>(null);
	const timer = useRef(0);

	useEffect(() => {
		const cv = ref.current!;
		const ctx = cv.getContext("2d")!;
		const paint = (list: Stroke[]) => list.forEach((s) => drawStroke(ctx, s, cv.width, cv.height));
		const redraw = () => {
			ctx.clearRect(0, 0, cv.width, cv.height);
			paint(inkOf(inkKey));
		};
		const ro = new ResizeObserver(() => {
			const r = cv.getBoundingClientRect();
			cv.width = Math.round(r.width * devicePixelRatio);
			cv.height = Math.round(r.height * devicePixelRatio);
			redraw();
		});
		ro.observe(cv);
		const sub = (added: Stroke[] | null) => (added ? paint(added) : redraw());
		inkSubs.add(sub);
		redraw();
		return () => {
			ro.disconnect();
			inkSubs.delete(sub);
		};
	}, [inkKey]);

	const flush = () => {
		clearTimeout(timer.current);
		timer.current = 0;
		const l = live.current;
		if (!l || l.s.x.length <= l.sent) return;
		const from = Math.max(0, l.sent - 1); // repeat the last sent point so segments join
		relay({ k: "doodle", strokes: [{ ...l.s, x: l.s.x.slice(from), y: l.s.y.slice(from) }] });
		l.sent = l.s.x.length;
	};
	const point = (e: ReactPointerEvent) => {
		const r = ref.current!.getBoundingClientRect();
		return [clamp01((e.clientX - r.left) / r.width), clamp01((e.clientY - r.top) / r.height)];
	};
	const paintTail = (s: Stroke) => {
		const cv = ref.current!;
		const n = Math.max(0, s.x.length - 2);
		drawStroke(cv.getContext("2d")!, { ...s, x: s.x.slice(n), y: s.y.slice(n) }, cv.width, cv.height);
	};

	const down = (e: ReactPointerEvent<HTMLCanvasElement>) => {
		if (!canDraw || live.current) return; // one finger at a time
		e.currentTarget.setPointerCapture(e.pointerId);
		const [x, y] = point(e);
		const s: Stroke = { x: [x], y: [y], color, size };
		inkOf(inkKey).push(s);
		live.current = { id: e.pointerId, s, sent: 0 };
		paintTail(s);
		timer.current ||= window.setTimeout(flush, 50);
	};
	const moveTo = (e: ReactPointerEvent) => {
		const l = live.current;
		if (!l || l.id !== e.pointerId) return;
		const [x, y] = point(e);
		if (x === l.s.x.at(-1) && y === l.s.y.at(-1)) return;
		l.s.x.push(x);
		l.s.y.push(y);
		paintTail(l.s);
		timer.current ||= window.setTimeout(flush, 50);
	};
	const up = (e: ReactPointerEvent) => {
		if (live.current?.id !== e.pointerId) return;
		flush();
		live.current = null;
		saveInk(inkKey);
	};

	return (
		<div className="dd-stage">
			<canvas
				ref={ref}
				className={cls("dd-canvas", canDraw && "can-draw")}
				onPointerDown={down}
				onPointerMove={moveTo}
				onPointerUp={up}
				onPointerCancel={up}
				role="img"
				aria-label={canDraw ? "Drawing canvas" : "Your partner's live drawing"}
			/>
			{children}
		</div>
	);
}

function DoodleGame({ c }: { c: Ctx }) {
	const s = c.game.state as L.Doodle;
	const key = inkKeyOf(c.game);
	const drawing = s.drawer === c.you;
	const [color, setColor] = useState<string>(INKS[0][1]);
	const [size, setSize] = useState(SIZES[1]);
	const [guess, setGuess] = useState("");
	const [bubbles, setBubbles] = useState<{ id: number; text: string; x: number }[]>([]);
	const [skips, setSkips] = useState(0);

	// The drawer's word lives only in this tab (sessionStorage), so a refresh keeps it and the guesser never sees it.
	const word = useMemo(() => {
		if (!drawing) return "";
		let w = ss.get(key);
		if (!w) ss.set(key, (w = L.pickWord(s.last ? [s.last.word] : [])));
		return w;
	}, [key, drawing, skips]); // `skips` forces a re-read after "Another word" stores a new one

	const pop = (text: string) => {
		const id = Math.random();
		setBubbles((b) => [...b.slice(-5), { id, text, x: 8 + Math.random() * 60 }]);
		setTimeout(() => setBubbles((b) => b.filter((x) => x.id !== id)), 2800);
	};

	// Wrong guesses float up on the drawer's screen (right ones are handled by the module-level listener above).
	const latest = useRef({ c, word, drawing });
	latest.current = { c, word, drawing };
	useEffect(
		() =>
			onRelay((from, d) => {
				const { c, word, drawing } = latest.current;
				if (d.k !== "doodle:guess" || !drawing || from !== c.them || typeof d.text !== "string") return;
				if (!L.guessMatches(d.text, word)) pop(d.text);
			}),
		[],
	);

	// The partner (re)joined, or came back after a blip: replay this round's drawing to them.
	useEffect(() => {
		if (!drawing || !c.live || !c.partnerSid) return;
		relay({ k: "doodle:clear" });
		L.chunkStrokes(inkOf(key)).forEach((strokes) => relay({ k: "doodle", strokes }));
	}, [c.partnerSid, c.live, drawing, key]);

	const clear = () => {
		addInk(key, null);
		saveInk(key);
		relay({ k: "doodle:clear" });
	};
	const newWord = () => {
		ss.set(key, L.pickWord([word, s.last?.word ?? ""]));
		setSkips(skips + 1);
		clear();
	};
	const sendGuess = (e: FormEvent) => {
		e.preventDefault();
		const text = guess.trim().slice(0, LIMITS.answer);
		if (!text || !c.live) return;
		relay({ k: "doodle:guess", text });
		pop(text);
		setGuess("");
	};

	const celebrate = useBurst(s.round);
	const solvedBy = s.last?.guessedBy;

	return (
		<div className="dd">
			{drawing ? (
				<div className="dd-word">
					<span>Draw this</span>
					<strong>{word}</strong>
					<button className="btn ghost sm dd-skip" onClick={newWord} disabled={!c.live}>
						<ArrowsClockwise aria-hidden />
						Another word
					</button>
				</div>
			) : (
				<p className="dd-word">
					<span>{c.name(c.them)} is drawing. What is it?</span>
				</p>
			)}

			<DoodleCanvas inkKey={key} canDraw={drawing && c.live} color={color} size={size}>
				{/* The partner peeks over the paper: pondering while you draw, bobbing while they draw. */}
				<Head who={c.them} mood={!c.live ? "away" : drawing ? "ponder" : "bob"} h="5.5em" className="dd-peek" />
				<div className="dd-bubbles" aria-live="polite">
					{bubbles.map((b) => (
						<span key={b.id} className="dd-bubble" style={vars({ "--x": `${b.x}%` })}>
							{b.text}
						</span>
					))}
				</div>
				{celebrate && s.last && solvedBy && (
					<div className="dd-yay" role="status">
						<span className="dd-yay-head">
							<Head who={solvedBy} moment="happy" h="5.5em" />
							<FlowerBurst />
						</span>
						<p>
							{who(c, solvedBy)} guessed it: <b>{s.last.word}</b>
						</p>
						<span className="dd-next">{drawing ? "Your turn to draw" : `Now ${c.name(s.drawer)} draws`}</span>
					</div>
				)}
			</DoodleCanvas>

			{drawing ? (
				<div className="dd-tools" role="toolbar" aria-label="Brush">
					<div className="dd-swatches">
						{INKS.map(([n, k]) => (
							<button key={k} className={cls("dd-swatch", k === color && "on")} style={vars({ "--ink": k })} onClick={() => setColor(k)} aria-label={n} aria-pressed={k === color} />
						))}
					</div>
					<div className="dd-sizes">
						{SIZES.map((z, i) => (
							<button key={z} className={cls("dd-size", z === size && "on")} onClick={() => setSize(z)} aria-label={["Thin", "Medium", "Thick"][i]} aria-pressed={z === size}>
								<span style={vars({ "--dot": `${6 + i * 7}px`, "--ink": color })} />
							</button>
						))}
					</div>
					<button className="btn paper sm" onClick={clear} disabled={!c.live}>
						<Eraser aria-hidden />
						Clear
					</button>
				</div>
			) : (
				<form className="mm-row dd-guess" onSubmit={sendGuess}>
					<label htmlFor="dd-guess" className="sr-only">
						Your guess
					</label>
					<input
						id="dd-guess"
						className="input"
						value={guess}
						maxLength={LIMITS.answer}
						autoComplete="off"
						placeholder="Is it a..."
						disabled={!c.live}
						onChange={(e) => setGuess(e.target.value)}
					/>
					<button className="btn" disabled={!guess.trim() || !c.live}>
						Guess
					</button>
				</form>
			)}
		</div>
	);
}
