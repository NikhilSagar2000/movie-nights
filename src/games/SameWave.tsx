import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type PointerEvent } from "react";
import { ArrowsClockwise, LockSimple } from "@phosphor-icons/react";
import { LIMITS, other, type Who } from "../../shared/types";
import { FlowerBurst, Head } from "../Character";
import { waveZone } from "../gameLogic";
import { onRelay, relay } from "../room";
import { WAVES, type Wave } from "./decks/waves";
import { commit, draw, Finish, nextRound, onPlay, secretFor, sendPlay, useSecret, type Base, type Ctx } from "./lead";

/* Same Wave: the lead sees a scale (Mild ↔ Spicy) and a secret spot on it, and gives a one-word clue.
   The other one drags the dial to where they think it is; the needle moves live on the lead's screen. */

type Secret = { scale: Wave; target: number };
export type SameWave = Base & { phase: "clue" | "guess" | "done"; scale?: Wave; clue?: string; dial?: number; target?: number };
const fresh = (b: Base): SameWave => ({ ...b, phase: "clue" });
/** Whoever opens the game guesses first. */
export const waveInit = (starter: Who): SameWave => fresh({ lead: other(starter), starter, round: 0, acks: [] });
const pick = (): Secret => ({ scale: draw("waves", WAVES, (w) => w.join("|")), target: 5 + Math.floor(Math.random() * 91) });
const clamp100 = (v: unknown) => Math.min(100, Math.max(0, Math.round(Number(v) || 0)));
const ZONE_TEXT = { bullseye: "Bullseye! Same wave", close: "So close", near: "Near", far: "Far off" } as const;

onPlay<SameWave>("wave", (s, p, g) => {
	if (p.act !== "lock" || s.phase !== "guess") return null;
	return { ...s, phase: "done", dial: clamp100(p.v), target: secretFor(g, s.round, pick).target };
});

export const waveStatus = (s: SameWave, you: Who, name: (w: Who) => string) =>
	s.phase === "done" ? "Round over" : s.lead === you ? `You give the clue. ${name(other(you))} turns the dial` : `${name(s.lead)} gives the clue. You turn the dial`;

export default function SameWaveGame({ c }: { c: Ctx }) {
	const s = c.game.state as SameWave;
	const leading = s.lead === c.you;
	const guesser = other(s.lead);
	const secret = useSecret(c, s, pick);
	const [clue, setClue] = useState("");
	const [dial, setDial] = useState(50);
	const [live, setLive] = useState<number | null>(null); // the guesser's needle, as seen by the lead
	const scale = s.scale ?? secret?.scale;

	// the guesser's needle, relayed live (never stored)
	useEffect(
		() =>
			onRelay((_, d) => {
				if (d.k === "play" && d.act === "dial" && d.id === c.game.id) setLive(clamp100(d.v));
			}),
		[c.game.id],
	);
	useEffect(() => {
		setDial(50);
		setLive(null);
	}, [s.round]);
	const lastSent = useRef(0);
	const turn = (v: number, final = false) => {
		setDial(v);
		const now = Date.now();
		if (final || now - lastSent.current > 50) {
			lastSent.current = now;
			relay({ k: "play", id: c.game.id, round: s.round, pid: "dial", act: "dial", v });
		}
	};

	const giveClue = (e: FormEvent) => {
		e.preventDefault();
		const v = clue.trim().slice(0, LIMITS.answer);
		if (!v || !secret) return;
		commit<SameWave>(c.game, (st) => (st.phase === "clue" ? { ...st, phase: "guess", scale: secret.scale, clue: v } : null));
		setClue("");
	};

	if (!scale)
		return (
			<div className="sw">
				<div className="em-board waiting">
					<Head who={s.lead} mood={c.live ? "ponder" : "away"} h="6em" />
					<p>{c.name(s.lead)} is looking at a scale and thinking of a clue</p>
				</div>
			</div>
		);

	const zone = s.phase === "done" && s.dial !== undefined && s.target !== undefined ? waveZone(s.dial, s.target) : null;
	const target = s.target ?? (leading ? secret?.target : undefined);
	const needle = s.phase === "done" ? s.dial : leading ? (live ?? undefined) : dial;

	return (
		<div className="sw">
			{s.clue && (
				<p className="sw-clue">
					<span>{leading ? "Your clue" : `${c.name(s.lead)}'s clue`}</span>
					<strong>{s.clue}</strong>
				</p>
			)}
			<div className="sw-dial-wrap">
				<Dial
					scale={scale}
					target={target}
					needle={needle}
					drag={!leading && s.phase === "guess" && c.live ? turn : undefined}
					label={`Where "${s.clue ?? ""}" sits between ${scale[0]} and ${scale[1]}`}
				/>
				{zone === "bullseye" && (
					<span className="sw-burst">
						<FlowerBurst />
					</span>
				)}
			</div>
			<div className="sw-ends" aria-hidden="true">
				<span>{scale[0]}</span>
				<span>{scale[1]}</span>
			</div>

			{s.phase === "done" && zone ? (
				<Finish
					text={ZONE_TEXT[zone]}
					sub={`Next round, ${guesser === c.you ? "you give the clue" : `${c.name(guesser)} gives the clue`}.`}
					sad={zone === "far"}
					button="Next round"
					onNext={() => nextRound(c.game, fresh)}
				/>
			) : leading ? (
				s.phase === "clue" ? (
					<form className="sw-give" onSubmit={giveClue}>
						<p>The bright band is your secret spot. Give one word (or a name) that sits right there.</p>
						<div className="mm-row">
							<input
								className="input"
								value={clue}
								maxLength={LIMITS.answer}
								autoComplete="off"
								aria-label="Your clue"
								placeholder="Your clue"
								disabled={!c.live}
								onChange={(e) => setClue(e.target.value)}
							/>
							<button className="btn" disabled={!clue.trim() || !c.live}>
								Give clue
							</button>
						</div>
						<button type="button" className="btn ghost sm wa-giveup" onClick={() => nextRound(c.game, fresh, s.lead)}>
							<ArrowsClockwise aria-hidden />
							Another scale
						</button>
					</form>
				) : (
					<p className="sw-note">{live === null ? `${c.name(guesser)} is thinking…` : `Watch ${c.name(guesser)} turn the dial`}</p>
				)
			) : s.phase === "guess" ? (
				<div className="sw-lock">
					<p>Drag the needle (or use the arrow keys), then lock it in.</p>
					<button className="btn" disabled={!c.live} onClick={() => sendPlay(c.game, s.round, "lock", dial)}>
						<LockSimple aria-hidden />
						Lock it in
					</button>
				</div>
			) : (
				<p className="sw-note">{c.name(s.lead)} is thinking of a clue</p>
			)}
		</div>
	);
}

// ---------- the dial: a half circle, 0 at the left end, 100 at the right ----------
const CX = 100, CY = 100, R = 84;
const angle = (v: number) => Math.PI * (1 - v / 100);
const at = (v: number, r = R) => [CX + r * Math.cos(angle(v)), CY - r * Math.sin(angle(v))] as const;
const arc = (a: number, b: number, r = R) => {
	const [x1, y1] = at(Math.max(0, a), r);
	const [x2, y2] = at(Math.min(100, b), r);
	return `M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`;
};

function Dial({ scale, target, needle, drag, label }: { scale: Wave; target?: number; needle?: number; drag?: (v: number, final?: boolean) => void; label: string }) {
	const svg = useRef<SVGSVGElement>(null);
	const holding = useRef(false);
	const valueAt = (e: PointerEvent) => {
		const r = svg.current!.getBoundingClientRect();
		const x = ((e.clientX - r.left) / r.width) * 200 - CX;
		const y = CY - ((e.clientY - r.top) / r.height) * 110;
		return clamp100(100 * (1 - Math.atan2(Math.max(0, y), x) / Math.PI));
	};
	const down = (e: PointerEvent<SVGSVGElement>) => {
		if (!drag) return;
		holding.current = true;
		e.currentTarget.setPointerCapture(e.pointerId);
		drag(valueAt(e));
	};
	const move = (e: PointerEvent<SVGSVGElement>) => holding.current && drag?.(valueAt(e));
	const up = (e: PointerEvent<SVGSVGElement>) => {
		if (!holding.current) return;
		holding.current = false;
		drag?.(valueAt(e), true);
	};
	const key = (e: KeyboardEvent<SVGSVGElement>) => {
		if (!drag || needle === undefined) return;
		const step = { ArrowLeft: -2, ArrowDown: -2, ArrowRight: 2, ArrowUp: 2, PageDown: -10, PageUp: 10, Home: -100, End: 100 }[e.key];
		if (!step) return;
		e.preventDefault();
		drag(clamp100(needle + step), true);
	};
	return (
		<svg
			ref={svg}
			className={`sw-dial${drag ? " can-drag" : ""}`}
			viewBox="0 0 200 110"
			role={drag ? "slider" : "img"}
			tabIndex={drag ? 0 : undefined}
			aria-label={label}
			aria-valuemin={drag ? 0 : undefined}
			aria-valuemax={drag ? 100 : undefined}
			aria-valuenow={drag ? needle : undefined}
			aria-valuetext={drag && needle !== undefined ? `${needle} of 100, from ${scale[0]} to ${scale[1]}` : undefined}
			onPointerDown={down}
			onPointerMove={move}
			onPointerUp={up}
			onPointerCancel={up}
			onKeyDown={key}
		>
			<defs>
				<linearGradient id="sw-grad" x1="0" x2="1">
					<stop offset="0" stopColor="var(--mist)" />
					<stop offset="1" stopColor="var(--blush)" />
				</linearGradient>
			</defs>
			<path d={arc(0, 100)} className="sw-track" stroke="url(#sw-grad)" />
			{target !== undefined && (
				<g className="sw-target">
					<path d={arc(target - 18, target + 18)} className="z3" />
					<path d={arc(target - 10, target + 10)} className="z2" />
					<path d={arc(target - 4, target + 4)} className="z1" />
				</g>
			)}
			{needle !== undefined && (
				<g className="sw-needle">
					{/* drawn pointing at 100, then turned: a CSS rotation, so it glides between live updates */}
					<line x1={CX} y1={CY} x2={CX + R - 10} y2={CY} style={{ rotate: `${-180 * (1 - needle / 100)}deg` }} />
					<circle cx={CX} cy={CY} r="7" />
				</g>
			)}
		</svg>
	);
}
