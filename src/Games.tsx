import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { LIMITS, other, type Game, type GameKind, type Stroke, type Who } from "../shared/types";
import { getRoom, onRelay, profileOf, relay, send, useRoom, type RoomState } from "./room";
import Teddy from "./Teddy";
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

type Meta = { name: string; blurb: string; init: (starter: Who) => unknown; turnBased?: boolean };
const GAMES: Record<GameKind, Meta> = {
	ttt: { name: "Tic-tac-toe", blurb: "Teddy vs bunny, three in a row.", init: L.tttInit, turnBased: true },
	c4: { name: "Connect Four", blurb: "Drop your pieces and line up four.", init: L.c4Init, turnBased: true },
	memory: { name: "Memory Match", blurb: "Flip cards and find all eight pairs.", init: (s) => L.memoryInit(s), turnBased: true },
	rps: { name: "Rock Paper Scissors", blurb: "Pick in secret, reveal on three.", init: () => null },
	mindmeld: { name: "Mind Meld", blurb: "Keep going until you say the same word.", init: () => null },
	doodle: { name: "Doodle & Guess", blurb: "One draws, one guesses, then swap.", init: L.doodleInit },
};
const KINDS = Object.keys(GAMES) as GameKind[];

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

function Away({ name }: { name: string }) {
	return (
		<div className="gm-away" role="status">
			<Teddy mood="sleep" size={44} />
			<p>{name} isn't here right now, and games need both of you 💤</p>
		</div>
	);
}

function Hub({ room }: { room: RoomState }) {
	const them = other(room.you);
	const live = room.online.some((p) => p.who === them);
	return (
		<main className="page games">
			<header className="hub-head">
				<Teddy mood="wave" size={92} accent={profileOf(room, room.you).color} />
				<div>
					<h1>Game corner</h1>
					<p className="muted">Pick something to play with {profileOf(room, them).name}. Whoever picks goes first.</p>
				</div>
			</header>
			{!live && <Away name={profileOf(room, them).name} />}
			<ul className="hub-grid">
				{KINDS.map((k) => (
					<li key={k}>
						<button className="hub-card" data-kind={k} onClick={() => send({ t: "game:new", kind: k, state: GAMES[k].init(room.you) })}>
							<span className="hub-art" aria-hidden="true">
								<Art kind={k} />
							</span>
							<span className="hub-name">{GAMES[k].name}</span>
							<span className="hub-blurb">{GAMES[k].blurb}</span>
						</button>
					</li>
				))}
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
				? "You're drawing ✏️"
				: `${name(them)} is drawing ✏️`
			: turn
				? turn === you
					? "Your turn!"
					: `${name(turn)}'s turn 💗`
				: GAMES[game.kind].turnBased
					? "Game over"
					: "You both play at once 🤫";

	const View = { ttt: TicTacToe, c4: ConnectFour, memory: MemoryGame, rps: Rps, mindmeld: MindMeld, doodle: DoodleGame }[game.kind];
	return (
		<main className="page games">
			<header className="gm-head">
				<button className="btn soft gm-back" onClick={() => send({ t: "game:end" })}>
					← All games
				</button>
				<h1 className="gm-title">{GAMES[game.kind].name}</h1>
				<p className={cls("gm-turn", turn === you && "mine")} style={turn ? vars({ "--who": c.color(turn) }) : undefined} aria-live="polite">
					{turn && <Token who={turn} color={c.color(turn)} />}
					{status}
				</p>
			</header>
			{!c.live && <Away name={name(them)} />}
			<section className="gm-body">
				<View key={game.id} c={c} />
			</section>
		</main>
	);
}

// ---------- shared pieces ----------
/** Player piece: a teddy face for "a", a bunny face for "b", in that person's color. Nests inside other SVGs via x/y/s. */
function Token({ who, color, x, y, s }: { who: Who; color: string; x?: number; y?: number; s?: number }) {
	const fill = { fill: color };
	return (
		<svg className="tok" viewBox="0 0 40 40" x={x} y={y} width={s} height={s} aria-hidden="true">
			{who === "a" ? (
				<>
					<circle cx="10" cy="11" r="6.5" style={fill} />
					<circle cx="30" cy="11" r="6.5" style={fill} />
					<circle cx="10" cy="11" r="3" className="tok-light" />
					<circle cx="30" cy="11" r="3" className="tok-light" />
					<circle cx="20" cy="22.5" r="14" style={fill} />
					<ellipse cx="20" cy="27.5" rx="6.5" ry="5" className="tok-light" />
					<ellipse cx="20" cy="25.5" rx="2.3" ry="1.7" className="tok-ink" />
				</>
			) : (
				<>
					<ellipse cx="14" cy="11" rx="4.5" ry="10.5" transform="rotate(-10 14 11)" style={fill} />
					<ellipse cx="26" cy="11" rx="4.5" ry="10.5" transform="rotate(10 26 11)" style={fill} />
					<ellipse cx="14" cy="11" rx="2" ry="6.5" transform="rotate(-10 14 11)" className="tok-light" />
					<ellipse cx="26" cy="11" rx="2" ry="6.5" transform="rotate(10 26 11)" className="tok-light" />
					<circle cx="20" cy="25" r="13.5" style={fill} />
					<path d="M18.2 27.2h3.6L20 29.2z" className="tok-ink" />
					<path d="M17.5 30.6q2.5 2 5 0" className="tok-line" />
				</>
			)}
			<circle cx="14.5" cy={who === "a" ? 20 : 23} r="1.9" className="tok-ink" />
			<circle cx="25.5" cy={who === "a" ? 20 : 23} r="1.9" className="tok-ink" />
			<circle cx="11.5" cy={who === "a" ? 26 : 28} r="2.2" className="tok-cheek" />
			<circle cx="28.5" cy={who === "a" ? 26 : 28} r="2.2" className="tok-cheek" />
		</svg>
	);
}

/** One-shot CSS confetti burst (hearts, dots, ribbons). Nothing happens under reduced motion. */
function Confetti() {
	const bits = useMemo(
		() =>
			Array.from({ length: 30 }, (_, i) => ({
				dx: `${(Math.random() - 0.5) * 90}vw`,
				up: `${-15 - Math.random() * 30}vh`,
				r: `${(Math.random() - 0.5) * 900}deg`,
				d: `${Math.random() * 0.25}s`,
				k: `c${i % 5} s${i % 3}`,
			})),
		[],
	);
	// Portaled so a transformed/animated ancestor can't trap the fixed overlay.
	return createPortal(
		<div className="confetti" aria-hidden="true">
			{bits.map((b, i) => (
				<i key={i} className={b.k} style={vars({ "--dx": b.dx, "--up": b.up, "--r": b.r, "--d": b.d })} />
			))}
		</div>,
		document.body,
	);
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

/** Celebration banner above a finished board: teddy cheers, confetti, play again. */
function Finish({ c, winner, text }: { c: Ctx; winner: Who | null; text: string }) {
	return (
		<div className="gm-done" role="status">
			<Confetti />
			<Teddy mood={winner ? "cheer" : "love"} size={72} accent={winner ? c.color(winner) : undefined} />
			<div>
				<h2>{text}</h2>
				<button className="btn" onClick={c.again}>
					Play again
				</button>
			</div>
		</div>
	);
}

function outcomeText(c: Ctx, out: L.Outcome) {
	if (out === "draw") return "A tie! Perfectly matched 💕";
	if (!out) return "";
	return out.who === c.you ? "You win! 🎉" : `${c.name(out.who)} wins! 🎉`;
}

const cellName = (c: Ctx, cell: L.Cell) => (cell ? `${c.name(cell)}'s ${cell === "a" ? "teddy" : "bunny"}` : "empty");

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
						{cell && <Token who={cell} color={c.color(cell)} />}
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
						{Array.from({ length: L.C4_ROWS }, (_, row) => {
							const i = row * L.C4_COLS + col;
							const cell = s.board[i];
							return (
								<span key={row} className={cls("c4-hole", win.includes(i) && "win")}>
									{cell && (
										<span className="c4-piece" style={vars({ "--row": row })}>
											<Token who={cell} color={c.color(cell)} />
										</span>
									)}
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
			{done && <Finish c={c} winner={null} text="Every pair found, what a team 💞" />}
			<div className="mem" role="group" aria-label="Memory cards">
				{s.deck.map((face, i) => {
					const owner = s.found[i];
					const up = !!owner || s.up.includes(i);
					return (
						<button
							key={i}
							className={cls("mem-card", up && "up", owner && "found")}
							style={owner ? vars({ "--who": c.color(owner) }) : undefined}
							disabled={!canMove || up}
							onClick={() => c.move(L.memoryFlip(s, i, c.you))}
							aria-label={up ? `${face}${owner ? `, found by ${c.name(owner)}` : ""}` : "Face-down card"}
						>
							<span className="mem-inner">
								<span className="mem-back">
									<svg viewBox="-12 -12 24 24" aria-hidden="true">
										<path d={HEART} />
									</svg>
								</span>
								<span className="mem-front">
									<span className="mem-face">{face}</span>
									{owner && <Token who={owner} color={c.color(owner)} />}
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
const HAND_ICON: Record<string, string> = { rock: "✊", paper: "✋", scissors: "✌️" };

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
	const theirLock = theyLocked && <p className="gm-lock">{c.name(c.them)} locked in ✓</p>;

	if (count)
		return (
			<div className="rps-stage">
				<div className="rps-hands">
					<span className="rps-hand shake" style={vars({ "--who": c.color(c.you) })}>
						✊
					</span>
					<span key={count} className="rps-count" aria-live="assertive">
						{count}
					</span>
					<span className="rps-hand shake flip" style={vars({ "--who": c.color(c.them) })}>
						✊
					</span>
				</div>
			</div>
		);

	if (iLocked)
		return (
			<div className="rps-stage">
				<Teddy mood="peek" size={96} accent={c.color(c.you)} />
				<h2>{mine ? `${HAND_ICON[mine]} locked in!` : "You're locked in ✓"}</h2>
				<p className="muted">Waiting for {c.name(c.them)}…</p>
				{theirLock}
			</div>
		);

	if (last && !again) {
		const r = L.rpsResult(last.a, last.b);
		return (
			<div className="rps-stage" key={reveals.length}>
				<Confetti />
				<div className="rps-hands">
					{[c.you, c.them].map((w) => (
						<figure key={w} className={cls("rps-reveal", r === w && "won")} style={vars({ "--who": c.color(w) })}>
							<span className={cls("rps-hand", w === c.them && "flip")}>{HAND_ICON[last[w]] ?? "❔"}</span>
							<figcaption>{w === c.you ? "You" : c.name(w)}</figcaption>
						</figure>
					))}
				</div>
				<h2>{r === "tie" ? "Same pick, great minds 💕" : r === c.you ? "You win this one! 🎉" : `${c.name(r)} wins this one! 🎉`}</h2>
				<button className="btn" onClick={() => setAgain(true)}>
					Again
				</button>
				{theirLock}
			</div>
		);
	}

	return (
		<div className="rps-stage">
			<p className="gm-rule">Choose in secret. Nothing shows until you've both picked.</p>
			<div className="rps-choices">
				{L.HANDS.map((h) => (
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
							{HAND_ICON[h]}
						</span>
						{h}
					</button>
				))}
			</div>
			{theirLock}
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
	useEffect(() => setMine(""), [rv.length]);

	const submit = (e: FormEvent) => {
		e.preventDefault();
		const w = text.trim();
		if (!w || iLocked || !c.live) return;
		c.seal(w);
		setMine(w);
		setText("");
	};

	return (
		<div className="mm">
			<p className="gm-rule">Round 1: say any word. Then both try to say a word that connects your last two words, until you say the SAME word.</p>
			{rv.length > 0 && (
				<ol className="mm-chain" aria-label="Your words so far">
					{rv.map((r, i) => (
						<li key={i} className={cls("mm-pair", synced && i === rv.length - 1 && "same")}>
							<span className="mm-word" style={vars({ "--who": c.color(c.you) })}>
								{r[c.you]}
							</span>
							<svg className="mm-link" viewBox="-12 -12 24 24" aria-hidden="true">
								<path d={HEART} />
							</svg>
							<span className="mm-word" style={vars({ "--who": c.color(c.them) })}>
								{r[c.them]}
							</span>
						</li>
					))}
				</ol>
			)}
			{synced ? (
				<div className="mm-win" role="status">
					<Confetti />
					<Teddy mood="cheer" size={110} accent={c.color(c.you)} />
					<h2>SAME BRAIN 💞</h2>
					<p>
						You synced in {rv.length} {rv.length === 1 ? "round" : "rounds"}.
					</p>
					<button className="btn" onClick={c.again}>
						Play again
					</button>
				</div>
			) : iLocked ? (
				<div className="mm-wait">
					<Teddy mood="think" size={80} accent={c.color(c.you)} />
					<p>
						{mine ? (
							<>
								Locked in: <b>{mine}</b>.
							</>
						) : (
							"You're locked in ✓"
						)}{" "}
						Waiting for {c.name(c.them)}…
					</p>
				</div>
			) : (
				<form className="mm-form" onSubmit={submit}>
					<label htmlFor="mm-word">
						{last ? (
							<>
								A word that connects <b>{last[c.you]}</b> and <b>{last[c.them]}</b>
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
							placeholder="one word or a tiny phrase"
							disabled={!c.live}
							onChange={(e) => setText(e.target.value)}
						/>
						<button className="btn" disabled={!text.trim() || !c.live}>
							Lock in
						</button>
					</div>
				</form>
			)}
			{!synced && c.locked.includes(c.them) && <p className="gm-lock">{c.name(c.them)} locked in ✓</p>}
		</div>
	);
}

// ---------- doodle & guess ----------
// Stroke colors are drawing data sent to the partner (not UI styling), so a sun can be yellow and grass green.
const INKS = ["#3d1a2e", "#fb6f92", "#c68b59", "#ffc94d", "#7cc6a0", "#6cb4ee"];
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
	const [color, setColor] = useState(INKS[0]);
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
					<span className="muted">Draw this:</span>
					<strong>{word}</strong>
					<button className="btn ghost dd-skip" onClick={newWord} disabled={!c.live}>
						Another word
					</button>
				</div>
			) : (
				<p className="dd-word">
					<span>
						{c.name(c.them)} is drawing. Type what you think it is!
					</span>
				</p>
			)}

			<DoodleCanvas inkKey={key} canDraw={drawing && c.live} color={color} size={size}>
				<div className="dd-bubbles" aria-live="polite">
					{bubbles.map((b) => (
						<span key={b.id} className="dd-bubble" style={vars({ "--x": `${b.x}%` })}>
							{b.text}
						</span>
					))}
				</div>
				{celebrate && s.last && solvedBy && (
					<div className="dd-yay" role="status">
						<Confetti />
						<Teddy mood="cheer" size={64} accent={c.color(solvedBy)} />
						<p>
							{solvedBy === c.you ? "You" : c.name(solvedBy)} guessed it: <b>{s.last.word}</b>! 🎉
						</p>
						<span className="muted">{drawing ? "Your turn to draw" : `Now ${c.name(s.drawer)} draws`}</span>
					</div>
				)}
			</DoodleCanvas>

			{drawing ? (
				<div className="dd-tools" role="toolbar" aria-label="Brush">
					<div className="dd-swatches">
						{INKS.map((k) => (
							<button key={k} className={cls("dd-swatch", k === color && "on")} style={vars({ "--ink": k })} onClick={() => setColor(k)} aria-label={`Color ${k}`} aria-pressed={k === color} />
						))}
					</div>
					<div className="dd-sizes">
						{SIZES.map((z, i) => (
							<button key={z} className={cls("dd-size", z === size && "on")} onClick={() => setSize(z)} aria-label={["Thin", "Medium", "Thick"][i]} aria-pressed={z === size}>
								<span style={vars({ "--dot": `${6 + i * 7}px`, "--ink": color })} />
							</button>
						))}
					</div>
					<button className="btn soft" onClick={clear} disabled={!c.live}>
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
						placeholder="Is it a…"
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

// ---------- hub illustrations ----------
const HEART = "M0 -3.5C-4.5 -10 -12 -4 -8 2.5C-6 5.5 -2.5 7.5 0 10C2.5 7.5 6 5.5 8 2.5C12 -4 4.5 -10 0 -3.5Z";

function Art({ kind }: { kind: GameKind }) {
	const teddy = "var(--hot)";
	const bunny = "var(--lilac)";
	const art: Record<GameKind, ReactNode> = {
		ttt: (
			<>
				<path d="M48 10v70M72 10v70M26 33h68M26 57h68" className="st st-rose" />
				<Token who="a" color={teddy} x={27} y={13} s={18} />
				<Token who="b" color={bunny} x={75} y={13} s={18} />
				<Token who="a" color={teddy} x={51} y={36} s={18} />
				<Token who="b" color={bunny} x={27} y={60} s={18} />
				<Token who="a" color={teddy} x={75} y={60} s={18} />
				<path d="M30 16l62 58" className="st st-hot dash" />
			</>
		),
		c4: (
			<>
				<rect x="22" y="26" width="76" height="58" rx="10" className="k-hot" />
				{[0, 1, 2, 3].flatMap((col) =>
					[0, 1, 2].map((row) => {
						const fill = ["", "", "k-cream", "k-lilac", "", "k-lilac", "k-cream", "k-cream", "", "", "k-lilac", "k-cream"][col * 3 + row];
						return <circle key={`${col}${row}`} cx={35 + col * 17} cy={39 + row * 16} r="6.5" className={fill || "k-blush"} />;
					}),
				)}
				<circle cx="86" cy="11" r="6.5" className="k-lilac" />
				<path d="M79 2v3M93 2v3" className="st st-rose thin" />
			</>
		),
		memory: (
			<>
				<g transform="rotate(-10 42 46)">
					<rect x="22" y="18" width="40" height="54" rx="8" className="k-hot" />
					<path d={HEART} transform="translate(42 44) scale(.9)" className="k-rose" />
				</g>
				<g transform="rotate(9 78 46)">
					<rect x="58" y="18" width="40" height="54" rx="8" className="k-cream" />
					<rect x="58" y="18" width="40" height="54" rx="8" className="st st-petal thin" />
					<path d={HEART} transform="translate(78 44) scale(1.1)" className="k-hot" />
				</g>
			</>
		),
		rps: (
			<>
				<path d="M15 55c-3-9 3-17 11-17 3-4 11-4 14 1 6 1 8 8 5 13 1 7-6 11-13 10-7 2-15-1-17-7z" className="k-fur" />
				<path d="M22 48q4-3 8 0M30 44q4-3 8 1" className="st st-plum thin" />
				<g transform="rotate(-6 60 46)">
					<rect x="47" y="28" width="26" height="34" rx="4" className="k-cream" />
					<path d="M52 37h16M52 44h16M52 51h10" className="st st-petal thin" />
				</g>
				<path d="M90 54l12-24M100 54l-12-24" className="st st-plum" />
				<circle cx="89" cy="59" r="5.5" className="st st-hot" />
				<circle cx="101" cy="59" r="5.5" className="st st-hot" />
			</>
		),
		mindmeld: (
			<>
				<path d="M34 44Q38 18 54 20M86 44Q82 18 66 20" className="st st-rose dash" />
				<path d={HEART} transform="translate(60 20) scale(1.3)" className="k-hot" />
				<Token who="a" color={teddy} x={12} y={40} s={40} />
				<Token who="b" color={bunny} x={68} y={40} s={40} />
			</>
		),
		doodle: (
			<>
				<rect x="16" y="12" width="72" height="64" rx="8" transform="rotate(-4 52 44)" className="k-white" />
				<path d="M52 36c-5-9-18-6-15 4 2 7 10 12 15 17 5-5 13-10 15-17 3-10-10-13-15-4z" className="st st-hot" />
				<g transform="rotate(32 96 44)">
					<rect x="90" y="12" width="12" height="44" rx="3" className="k-rose" />
					<path d="M90 56h12l-6 12z" className="k-fur-light" />
					<path d="M94.2 64.5 96 68l1.8-3.5z" className="k-plum" />
				</g>
			</>
		),
	};
	return <svg viewBox="0 0 120 90">{art[kind]}</svg>;
}
