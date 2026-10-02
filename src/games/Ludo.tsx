import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { SpeakerHigh, SpeakerSlash } from "@phosphor-icons/react";
import type { Who } from "../../shared/types";
import { setMuted, sfx, useMuted, useUnlockSound } from "../arcade/sound";
import { Face, Flower, FlowerBurst } from "../Character";
import { cls, commit, Finish, vars, type Ctx } from "./lead";
import { COLOURS, HOME, move, movesOf, pass, pointOf, ready, rematch, roll, seat, setColours, setTokens, start, turned, turnOf, viewOf, type Colour, type Ludo, type Pt } from "./ludoLogic";
import type { Last } from "./ludoState";
import "./ludo.css";

/* Ludo: a paper board lying on the gingham cloth, the two of you as the tokens. The rules are in ludoLogic.ts.
   Every write goes through commit() and the Room keeps the board, so a reload picks up where you were. In play only the
   turn's player writes; their browser also plays a lone move and passes a dead roll by itself.
   Both screens play the same sounds (the arcade's, one mute switch for every game) as they see the same moves. */

const NAME: Record<Colour, string> = { rose: "pink", sage: "green", sun: "yellow", sky: "blue" };
const paint = (c: Colour) => `var(--ld-${c})`;
const ring = (c: Colour) => `var(--ld-${c}-deep)`;
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const d6 = () => 1 + (crypto.getRandomValues(new Uint32Array(1))[0] % 6);
const place = ([x, y]: Pt) => ({ left: `${(x / 15) * 100}%`, top: `${(y / 15) * 100}%` });
const span = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, n) => from + n);
const HOP_MS = 170;
const DIE_MS = 1100; // from the roll to the die settling on the tray (Die, below)
/** How long a move takes on screen: its hops (hop(), below), then anyone it caught flying home (fly()). */
const moveMs = (l: Last) => Math.max(420, (l.from < 0 ? 1 : l.to - l.from) * HOP_MS) + (l.hit.length ? 800 : 0);
const moveKeyOf = (s: Ludo) => (s.last ? `${s.last.n}:${s.last.colour}:${s.last.i}` : "");

export default function LudoGame({ c }: { c: Ctx }) {
	const s = c.game.state as Ludo;
	const mine = turnOf(s) === c.you;
	const can = mine && c.live;
	const moves = movesOf(s);
	const write = (fn: (st: Ludo) => Ludo | null) => commit<Ludo>(c.game, fn);
	useUnlockSound();

	// One thing at a time, on both screens: while the die tumbles or a head hops, nothing else starts. The turn shown
	// stays with the mover, the die can't be rolled, nothing moves by itself, and the end waits for the last hop.
	const moveKey = moveKeyOf(s);
	const [busy, setBusy] = useState<"die" | "move" | null>(null);
	const seen = useRef({ rolls: s.rolls, moveKey });
	useLayoutEffect(() => {
		const before = seen.current;
		seen.current = { rolls: s.rolls, moveKey };
		const what = before.moveKey !== moveKey && s.last ? "move" : before.rolls !== s.rolls ? "die" : null;
		if (!what) return;
		setBusy(what);
		const t = setTimeout(
			() => {
				setBusy(null);
				// the die has landed: a 6 sparkles, a dead roll goes "aww"
				if (what === "die" && s.roll !== null) sfx(!moves.length ? "thud" : s.roll === 6 ? "coin" : "tick", !moves.length ? 1.3 : 1);
			},
			reduced() ? 0 : what === "die" ? DIE_MS : moveMs(s.last!),
		);
		return () => clearTimeout(t);
	}, [s.rolls, moveKey]);
	const calm = !busy;
	const showing: Colour = busy === "move" && s.last ? s.last.colour : s.turn;

	// my turn, once all is still: a lone move plays itself; a dead roll (or a third 6) passes after a beat to read it
	useEffect(() => {
		if (!can || !calm || s.roll === null || moves.length > 1) return;
		const r = s.rolls;
		const only = moves[0]?.i;
		const t = setTimeout(() => write((st) => (st.rolls !== r ? null : only === undefined ? pass(st) : move(st, only))), only === undefined ? 900 : reduced() ? 600 : 250);
		return () => clearTimeout(t);
	}, [can, calm, s.rolls, s.roll]);

	// the moments between moves, once all is still: your turn comes round, and the end
	const shownWho = s.phase === "play" ? (s.seats[showing] ?? null) : null;
	const was = useRef({ who: shownWho, phase: s.phase });
	useEffect(() => {
		if (!calm) return;
		const before = was.current;
		was.current = { who: shownWho, phase: s.phase };
		if (s.phase === "done" && before.phase === "play") sfx(s.winner === c.you ? "best" : "over");
		else if (shownWho === c.you && before.who !== c.you) sfx("pop", 0.8);
	}, [calm, shownWho, s.phase]);

	return (
		<div className="ld">
			{s.phase === "setup" && <Setup c={c} s={s} write={write} />}
			<div className="ld-cloth">
				<Board c={c} s={s} showing={showing} moves={can && calm ? moves : []} write={write} />
			</div>
			{(s.phase === "play" || (s.phase === "done" && !calm)) && (
				<Tray c={c} s={s} showing={showing} busy={busy} moves={moves} ready={can && calm && s.roll === null} onRoll={() => write((st) => (turnOf(st) === c.you ? roll(st, d6()) : null))} />
			)}
			{s.phase === "done" && s.winner && calm && (
				<Finish
					text={s.winner === c.you ? "You won!" : `${c.name(s.winner)} won this one`}
					sub={s.winner === c.you ? "All your little heads made it home." : "So close. Again?"}
					sad={s.winner !== c.you}
					button="Play again"
					onNext={() => write((st) => (st.phase === "done" ? rematch(st) : null))}
				/>
			)}
		</div>
	);
}

// ---------- setup: two toggles, then one of you picks a colour (the other gets the one across) ----------
function Setup({ c, s, write }: { c: Ctx; s: Ludo; write: (fn: (st: Ludo) => Ludo | null) => void }) {
	return (
		<div className="ld-setup">
			<div className="ld-opts">
				{(
					[
						["Colours", s.colours, setColours],
						["Tokens", s.tokens, setTokens],
					] as const
				).map(([label, value, set]) => (
					<div key={label} className="ld-opt">
						<span id={`ld-${label}`}>{label}</span>
						<div className="ar-modes" role="group" aria-labelledby={`ld-${label}`}>
							{([2, 4] as const).map((n) => (
								<button key={n} className={cls("ar-mode", value === n && "on")} aria-pressed={value === n} disabled={!c.live} onClick={() => write((st) => set(st, n))}>
									{n}
								</button>
							))}
						</div>
					</div>
				))}
			</div>
			<p className="ld-say" aria-live="polite">
				{ready(s) ? (
					<button className="btn" disabled={!c.live} onClick={() => write(start)}>
						Let's play
					</button>
				) : s.colours === 4 ? (
					"Pick a colour: you get the one across too"
				) : (
					`Pick your colour. ${c.name(c.them)} gets the one across`
				)}
			</p>
		</div>
	);
}

// ---------- the board ----------
type Tok = { c: Colour; i: number; p: number; who: Who; pt: Pt; dx: number; n: number };

function Board({ c, s, showing, moves, write }: { c: Ctx; s: Ludo; showing: Colour; moves: { i: number; from: number }[]; write: (fn: (st: Ludo) => Ludo | null) => void }) {
	const board = useRef<HTMLDivElement>(null);
	const els = useRef(new Map<string, HTMLElement>());
	const [dizzy, setDizzy] = useState<string[]>([]);
	const [burst, setBurst] = useState(0);

	// your colour sits at the bottom left of your screen: every point is turned by your view
	const q = viewOf(s, c.you);
	const at = (col: Colour, p: number, i: number) => turned(pointOf(col, p, i), q);
	// tokens, with the ones sharing a square fanned out a little
	const toks: Tok[] = COLOURS.flatMap((col) => (s.pos[col] ?? []).map((p, i) => ({ c: col, i, p, who: s.seats[col]!, pt: at(col, p, i), dx: 0, n: 1 })));
	const stacks = new Map<string, Tok[]>();
	for (const t of toks) if (t.p >= 0 && t.p < HOME) stacks.set(t.pt.join(), [...(stacks.get(t.pt.join()) ?? []), t]);
	for (const group of stacks.values()) group.forEach((t, j) => Object.assign(t, { dx: j - (group.length - 1) / 2, n: group.length }));

	// a move just landed (on either screen): the token hops square by square, anyone it lands on flies home dizzy
	const moveKey = moveKeyOf(s);
	const seen = useRef(moveKey);
	useLayoutEffect(() => {
		if (seen.current === moveKey || !s.last) return;
		seen.current = moveKey;
		const { colour, i, from, to, hit } = s.last;
		const hitKeys = hit.map((h) => h.colour + h.i);
		if (hitKeys.length) setDizzy(hitKeys);
		const cell = (board.current?.clientWidth ?? 0) / 15;
		let ms = 0;
		if (!reduced() && cell) {
			const path = from < 0 ? [at(colour, -1, i), at(colour, 0, i)] : span(from, to).map((p) => at(colour, p, i));
			ms = hop(els.current.get(colour + i), path, cell);
			hit.forEach((h) => fly(els.current.get(h.colour + h.i), at(h.colour, h.from, h.i), at(h.colour, -1, h.i), cell, ms));
		}
		const timers: ReturnType<typeof setTimeout>[] = [];
		const later = (f: () => void, at: number) => timers.push(setTimeout(f, at));
		// a tap for every square it lands on (a little higher each time); waking up out of the yard is a hop
		const steps = from < 0 ? 0 : to - from;
		if (!steps) sfx("hop");
		for (let j = 1; j <= steps; j++) later(() => sfx("tick", 0.7 + j * 0.04), ms ? (ms * j) / steps : 0);
		if (hitKeys.length) {
			later(() => sfx("hit"), ms);
			later(() => sfx("flap", 0.8), ms + 150);
			later(() => setDizzy([]), ms + 2200);
		}
		if (to === HOME)
			later(() => {
				sfx("chime");
				setBurst((b) => b + 1);
			}, ms);
		return () => timers.forEach(clearTimeout);
	}, [moveKey]);

	const movable = new Map(moves.map((m) => [m.from, m.i]));
	const sit = (col: Colour) => write((st) => seat(st, col, c.you));
	return (
		<div className={cls("ld-board", s.phase === "play" && "playing")} ref={board} role="group" aria-label="Ludo board">
			<BoardArt q={q} />
			{burst > 0 && (
				<span className="ld-burst" key={burst}>
					<FlowerBurst />
				</span>
			)}
			{COLOURS.map((col) => {
				const w = s.seats[col];
				return (
					<div key={col} className={cls("ld-yard", s.phase === "play" && showing === col && "on")} data-q={(COLOURS.indexOf(col) + q) % 4} data-asleep={s.pos[col]?.includes(-1) || undefined}>
						{s.phase === "setup" && (
							<button className={cls("ld-seat", w && "taken")} disabled={!c.live} onClick={() => sit(col)} aria-label={w ? `${NAME[col]}: ${w === c.you ? "you" : c.name(w)}` : `Pick ${NAME[col]}${s.pick ? " instead" : ""}`}>
								{w ? (
									<>
										<Face key={w} who={w} ring={ring(col)} moment="arrive" s="46%" rw="2.4cqi" />
										<span className="ld-seat-name">{w === c.you ? "you" : c.name(w)}</span>
									</>
								) : (
									!s.pick && <span className="ld-seat-name free">pick me</span> // picked: the spare corners stay quiet (a tap still swaps)
								)}
							</button>
						)}
					</div>
				);
			})}
			{toks.map((t) => {
				const key = t.c + t.i;
				const go = t.c === s.turn && movable.get(t.p) === t.i;
				const style = { ...place(t.pt), "--dx": t.dx, "--k": t.n > 1 ? 0.74 : 1, zIndex: go ? 30 : t.p < 0 ? 1 : 10 + Math.round(t.pt[1]) } as CSSProperties;
				const face = <Face who={t.who} ring={ring(t.c)} mood={dizzy.includes(key) ? "dizzy" : t.p < 0 ? "away" : "still"} />;
				const ref = (el: HTMLElement | null) => void (el ? els.current.set(key, el) : els.current.delete(key));
				return go ? (
					<button key={key} ref={ref} className="ld-tok go" data-c={t.c} style={style} onClick={() => write((st) => (turnOf(st) === c.you ? move(st, t.i) : null))} aria-label={t.p < 0 ? `Bring out a ${NAME[t.c]} token` : `Move your ${NAME[t.c]} token ${s.roll}`}>
						{face}
					</button>
				) : (
					<span key={key} ref={ref} className={cls("ld-tok", t.p < 0 && "sleep", t.p === HOME && "home")} data-c={t.c} style={style} aria-hidden="true">
						{face}
					</span>
				);
			})}
			{s.phase !== "setup" && (
				<p className="sr-only">
					{COLOURS.filter((col) => s.pos[col]).map((col) => {
						const ps = s.pos[col]!;
						const w = s.seats[col]!;
						return `${w === c.you ? "Your" : `${c.name(w)}'s`} ${NAME[col]}: ${ps.filter((p) => p < 0).length} waiting, ${ps.filter((p) => p >= 0 && p < HOME).length} on the board, ${ps.filter((p) => p === HOME).length} home. `;
					})}
				</p>
			)}
		</div>
	);
}

/** Hops along `path` (board units) to where the token is drawn now; returns how long it takes. */
function hop(el: HTMLElement | undefined, path: Pt[], cell: number) {
	if (!el || path.length < 2) return 0;
	const end = path.at(-1)!;
	const off = ([x, y]: Pt, lift = 0) => `${(x - end[0]) * cell}px ${(y - end[1] - lift) * cell}px`;
	const n = path.length - 1;
	const frames: Keyframe[] = path.flatMap((p, j) => {
		const step: Keyframe = { offset: j / n, translate: off(p), scale: "1", easing: "ease-out" };
		if (j === n) return [step];
		const q = path[j + 1];
		return [step, { offset: (j + 0.5) / n, translate: off([(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], n === 1 ? 1.2 : 0.5), scale: "1.2", easing: "ease-in" }];
	});
	const ms = Math.max(420, n * HOP_MS);
	el.animate(frames, { duration: ms, fill: "backwards" });
	return ms;
}

/** A captured token: spins up off its square and lands back in its yard, after the hop that caught it. */
function fly(el: HTMLElement | undefined, from: Pt, to: Pt, cell: number, delay: number) {
	if (!el) return;
	const off = ([x, y]: Pt, lift = 0) => `${(x - to[0]) * cell}px ${(y - to[1] - lift) * cell}px`;
	el.animate(
		[
			{ translate: off(from), rotate: "0deg", scale: "1" },
			{ translate: off([(from[0] + to[0]) / 2, (from[1] + to[1]) / 2], 3), rotate: "200deg", scale: "1.45", offset: 0.5 },
			{ translate: "0px 0px", rotate: "360deg", scale: "1" },
		],
		{ duration: 800, delay, easing: "ease-in-out", fill: "backwards" },
	);
}

// ---------- the drawing: rose's quarter, turned for each colour, around a centre of four triangles ----------
const ARM = [6, 7, 8].flatMap((r) => [0, 1, 2, 3, 4, 5].map((col) => [r, col] as const));
const PILLOWS: Pt[] = [
	[2, 2],
	[4, 2],
	[2, 4],
	[4, 4],
];
const flowerAt = (r: number, col: number) => <use key={`f${r}${col}`} className="ld-flower" href="#flower" x={col + 0.14} y={r + 0.14} width="0.72" height="0.72" />;

/** `q`: quarter turns for your view. The drawing swings round when a colour is picked (the shorter way). */
function BoardArt({ q }: { q: number }) {
	return (
		<svg className="ld-art" viewBox="0 0 15 15" aria-hidden="true">
			<rect className="ld-paper" x="0.04" y="0.04" width="14.92" height="14.92" rx="0.7" />
			<g className="ld-spin" style={{ transform: `rotate(${q === 3 ? -90 : q * 90}deg)` }}>
			{COLOURS.map((col, q) => (
				<g key={col} transform={`rotate(${90 * q} 7.5 7.5)`} style={vars({ "--c": paint(col) })}>
					<rect className="ld-yard-bg" x="0.22" y="0.22" width="5.56" height="5.56" rx="0.9" />
					<rect className="ld-nest" x="1" y="1" width="4" height="4" rx="0.85" />
					{PILLOWS.map(([x, y]) => (
						<circle key={`${x}${y}`} className="ld-pillow" cx={x} cy={y} r="0.62" />
					))}
					{ARM.map(([r, col2]) => (
						<rect key={`${r}${col2}`} className={cls("ld-sq", ((r === 7 && col2 > 0) || (r === 6 && col2 === 1)) && "mine")} x={col2 + 0.07} y={r + 0.07} width="0.86" height="0.86" rx="0.2" />
					))}
					{flowerAt(6, 1)}
					{flowerAt(8, 2)}
					<path className="ld-arrow" d="M0.3 7.5H0.72M0.56 7.33 0.74 7.5 0.56 7.67" />
					<path className="ld-tri" d="M6.05 6.05 7.5 7.5 6.05 8.95Z" />
				</g>
			))}
			</g>
			<use className="ld-flower big" href="#flower" x="6.85" y="6.85" width="1.3" height="1.3" />
		</svg>
	);
}

// ---------- the tray: whose turn, the die in its little cup (only on your turn), and the sound switch ----------
function Tray({ c, s, showing, busy, moves, ready, onRoll }: { c: Ctx; s: Ludo; showing: Colour; busy: "die" | "move" | null; moves: unknown[]; ready: boolean; onRoll: () => void }) {
	const who = s.seats[showing]!;
	const you = who === c.you;
	const them = c.name(who);
	const muted = useMuted();
	const say = busy
		? busy === "die"
			? "Rolling…"
			: "Hop, hop…"
		: s.roll === null
			? you
				? s.again
					? "Roll again!"
					: "Tap the die to roll"
				: `${them} is rolling`
			: s.sixes >= 3
				? `Three 6s! ${you ? "Your" : "Their"} turn's over`
				: !moves.length
					? you
						? `No move with a ${s.roll}`
						: `${them} rolled a ${s.roll}: no move`
					: moves.length === 1
						? you
							? "Off it goes…"
							: `${them} rolled a ${s.roll}`
						: you
							? "Tap a head to move it"
							: `${them} rolled a ${s.roll}, choosing…`;
	return (
		<div className={cls("ld-tray", you && "you")}>
			<Face who={who} ring={ring(showing)} s="2.4em" rw="0.32em" mood={you ? "idle" : c.live ? "ponder" : "away"} />
			<p className="ld-turn" aria-live="polite">
				<b>{you ? "Your turn" : `${them}'s turn`}</b>
				<span>{say}</span>
			</p>
			{you && <Die n={s.die} rolls={s.rolls} ready={ready} onRoll={onRoll} />}
			<button className="btn paper sm icon ld-sound" aria-pressed={!muted} aria-label="Sound" onClick={() => setMuted(!muted)}>
				{muted ? <SpeakerSlash aria-hidden /> : <SpeakerHigh aria-hidden />}
			</button>
		</div>
	);
}

// The die is a cube: six faces in 3D (his flower is the 1). A roll shakes the cup, and the die tumbles out, bounces
// twice and lands on the number, on both screens.
const PIPS: Record<number, number[]> = { 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
/** How far to turn the cube so face n looks at you (0, before the first roll, shows the flower). */
const SHOW: Record<number, [x: number, y: number]> = { 0: [0, 0], 1: [0, 0], 2: [0, -90], 3: [-90, 0], 4: [90, 0], 5: [0, 90], 6: [0, 180] };
const facing = (n: number, [x, y, z] = [0, 0, 0]) => `rotateX(${SHOW[n][0] + x}deg) rotateY(${SHOW[n][1] + y}deg) rotateZ(${z}deg)`;
const spins = () => 360 * (Math.random() < 0.5 ? -1 : 1) * (1 + Math.floor(Math.random() * 2));

function Die({ n, rolls, ready, onRoll }: { n: number; rolls: number; ready: boolean; onRoll: () => void }) {
	const cup = useRef<SVGSVGElement>(null);
	const air = useRef<HTMLSpanElement>(null);
	const cube = useRef<HTMLSpanElement>(null);
	const shade = useRef<HTMLSpanElement>(null);
	const seen = useRef(rolls);
	useEffect(() => {
		if (seen.current === rolls) return;
		seen.current = rolls;
		if (reduced()) return void sfx("clack");
		sfx("rattle");
		cup.current?.animate([{ rotate: "0deg" }, { rotate: "-14deg" }, { rotate: "10deg" }, { rotate: "-8deg" }, { rotate: "-30deg", offset: 0.75 }, { rotate: "0deg" }], { duration: 440, easing: "ease-in-out" });
		const tumble = { duration: DIE_MS - 240, delay: 240, fill: "backwards" as const };
		cube.current?.animate([{ transform: facing(n, [2 * spins(), spins(), spins()]) }, { transform: facing(n) }], { ...tumble, easing: "cubic-bezier(.2,.7,.3,1)" });
		air.current?.animate(
			[
				{ translate: "-2.4em 0.2em", scale: "0.45" },
				{ translate: "-1em -2.1em", scale: "1.1", offset: 0.3, easing: "ease-in" },
				{ translate: "-0.25em 0", scale: "1", offset: 0.55, easing: "ease-out" },
				{ translate: "-0.1em -0.65em", offset: 0.7, easing: "ease-in" },
				{ translate: "0 0", offset: 0.84, easing: "ease-out" },
				{ translate: "0 -0.15em", offset: 0.92, easing: "ease-in" },
				{ translate: "0 0", scale: "1" },
			],
			tumble,
		);
		shade.current?.animate(
			[{ scale: "0.3", opacity: 0 }, { scale: "0.45", opacity: 0.3, offset: 0.3 }, { scale: "1", opacity: 1, offset: 0.55 }, { scale: "0.75", offset: 0.7 }, { scale: "1", offset: 0.84 }, { scale: "1", opacity: 1 }],
			tumble,
		);
		const timers = [0.55, 0.84].map((at, k) => setTimeout(() => sfx("clack", 1 + k * 0.2), 240 + (DIE_MS - 240) * at));
		return () => timers.forEach(clearTimeout);
	}, [rolls]);
	return (
		<div className={cls("ld-dice", ready && "ready")}>
			<svg ref={cup} className="ld-cup" viewBox="0 0 44 36" aria-hidden="true">
				<path className="ld-cup-body" d="M39 3 12 6.5Q6 7.5 6 18T12 29.5L39 33Z" />
				<path className="ld-cup-band" d="M28.5 5V31" />
				<ellipse className="ld-cup-rim" cx="39.5" cy="18" rx="3.6" ry="15" />
			</svg>
			<button className="ld-die" disabled={!ready} onClick={onRoll} aria-label={ready ? "Roll the die" : n ? `The die shows ${n}` : "The die"}>
				<span ref={shade} className="ld-die-shade" />
				<span ref={air} className="ld-air">
					<span className="ld-tilt">
						<span ref={cube} className="ld-cube" style={{ transform: facing(n) }}>
							{[1, 2, 3, 4, 5, 6].map((f) => (
								<span key={f} className="ld-face" data-n={f}>
									{f === 1 ? <Flower /> : PIPS[f].map((p) => <i key={p} style={{ gridArea: `${Math.floor(p / 3) + 1} / ${(p % 3) + 1}` }} />)}
								</span>
							))}
						</span>
					</span>
				</span>
			</button>
		</div>
	);
}
