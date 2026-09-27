import { useState, type FormEvent } from "react";
import { ArrowsClockwise, Check, Lightbulb } from "@phosphor-icons/react";
import { LIMITS, other, type Who } from "../../shared/types";
import { Head } from "../Character";
import { PEOPLE } from "./decks/people";
import { cls, commit, draw, Finish, named, nextRound, onPlay, secretFor, sendPlay, useSecret, type Base, type Ctx } from "./lead";

/* Who Am I? The lead sees a famous person and answers yes/no questions; the other one asks (out loud or typed) and guesses.
   Only the lead's browser knows the person, so it checks the guesses. */

export type Answer = "yes" | "no" | "kinda" | "unsure";
type Entry = { q?: string; a?: Answer };
export type WhoAmI = Base & { log: Entry[]; wrong: string[]; hint?: string; done?: { name: string; guessed: boolean } };

const ANSWERS: [Answer, string][] = [
	["yes", "Yes"],
	["no", "No"],
	["kinda", "Kind of"],
	["unsure", "Not sure"],
];
const LOG_MAX = 40;
const pick = () => draw("people", PEOPLE, (p) => p.n);
const fresh = (b: Base): WhoAmI => ({ ...b, log: [], wrong: [] });
/** Whoever opens the game guesses first. */
export const whoamiInit = (starter: Who): WhoAmI => fresh({ lead: other(starter), starter, round: 0, acks: [] });
const clip = (v: unknown) => String(v ?? "").trim().slice(0, LIMITS.answer);

// The guesser's moves, applied in the lead's browser.
onPlay<WhoAmI>("whoami", (s, p, g) => {
	if (s.done) return null;
	const card = secretFor(g, s.round, pick);
	const v = clip(p.v);
	if (p.act === "ask") return v && s.log.length < LOG_MAX ? { ...s, log: [...s.log, { q: v }] } : null;
	if (p.act === "hint") return { ...s, hint: card.h };
	if (p.act === "giveup") return { ...s, done: { name: card.n, guessed: false } };
	if (p.act === "guess" && v) return named(v, card.n, card.aka) ? { ...s, done: { name: card.n, guessed: true } } : { ...s, wrong: [...s.wrong, v].slice(-8) };
	return null;
});

export const whoamiStatus = (s: WhoAmI, you: Who, name: (w: Who) => string) =>
	s.done ? "Round over" : s.lead === you ? `You know who it is. ${name(other(you))} is guessing` : `${name(s.lead)} knows who it is. You are guessing`;

export default function WhoAmIGame({ c }: { c: Ctx }) {
	const s = c.game.state as WhoAmI;
	const leading = s.lead === c.you;
	const guesser = other(s.lead);
	const card = useSecret(c, s, pick);
	const [q, setQ] = useState("");
	const [guess, setGuess] = useState("");
	const asked = s.log.length;
	const pending = s.log.findIndex((e) => e.q && !e.a);

	const answer = (a: Answer) =>
		commit<WhoAmI>(c.game, (st) => {
			if (st.done) return null;
			const i = st.log.findIndex((e) => e.q && !e.a); // a typed question waiting, else a spoken one
			if (i >= 0) return { ...st, log: st.log.map((e, j) => (j === i ? { ...e, a } : e)) };
			return st.log.length < LOG_MAX ? { ...st, log: [...st.log, { a }] } : null;
		});
	const right = () => card && commit<WhoAmI>(c.game, (st) => (st.done ? null : { ...st, done: { name: card.n, guessed: true } }));
	const swap = () => nextRound(c.game, fresh, s.lead); // same lead, a new person, a clean slate
	const play = (act: string, v?: string) => sendPlay(c.game, s.round, act, v);
	const ask = (e: FormEvent) => {
		e.preventDefault();
		const v = clip(q);
		if (!v || !c.live) return;
		play("ask", v);
		setQ("");
	};
	const tryGuess = (e: FormEvent) => {
		e.preventDefault();
		const v = clip(guess);
		if (!v || !c.live) return;
		play("guess", v);
		setGuess("");
	};

	if (s.done) {
		const next = s.lead; // the one who knew guesses next
		const who = guesser === c.you ? "You" : c.name(guesser);
		return (
			<Finish
				text={s.done.guessed ? `${who} got it: ${s.done.name}` : `It was ${s.done.name}`}
				sub={`${s.done.guessed ? `In ${asked} ${asked === 1 ? "question" : "questions"}. ` : ""}Next round, ${next === c.you ? "you guess" : `${c.name(next)} guesses`}.`}
				sad={!s.done.guessed}
				button="Next round"
				onNext={() => nextRound(c.game, fresh)}
			/>
		);
	}

	return (
		<div className="wa">
			{leading ? (
				<div className="wa-card knows">
					<span className="wa-card-top">{c.name(guesser)} is guessing. Keep it secret!</span>
					<strong className="wa-name">{card?.n ?? "…"}</strong>
					{card && <span className="chip fog wa-cat">{card.h}</span>}
					{s.hint && <span className="wa-note">You showed the hint</span>}
				</div>
			) : (
				<div className="wa-card mystery">
					<i className="stars" />
					<span className="wa-q" aria-hidden="true">
						?
					</span>
					<strong className="wa-name">Who am I?</strong>
					{s.hint ? (
						<span className="chip glass wa-cat">
							<Lightbulb aria-hidden />
							{s.hint}
						</span>
					) : (
						<button className="btn glass sm" disabled={!c.live} onClick={() => play("hint")}>
							<Lightbulb aria-hidden />
							Show a hint
						</button>
					)}
					<span className="wa-peek" aria-hidden="true">
						<Head who={s.lead} mood={c.live ? "ponder" : "away"} h="5.4em" />
					</span>
				</div>
			)}

			{leading ? (
				<div className="wa-answer">
					<p className="wa-asking" aria-live="polite">
						{pending >= 0 ? (
							<>
								<b>{c.name(guesser)}:</b> {s.log[pending].q}
							</>
						) : (
							`Listen to ${c.name(guesser)}'s question, then answer`
						)}
					</p>
					<div className="wa-answers" role="group" aria-label="Answer">
						{ANSWERS.map(([a, label]) => (
							<button key={a} className={`wa-a ${a}`} disabled={!c.live} onClick={() => answer(a)}>
								{label}
							</button>
						))}
					</div>
					<div className="wa-row">
						<button className="btn" disabled={!c.live} onClick={right}>
							<Check aria-hidden />
							That's right!
						</button>
						<button className="btn ghost" disabled={!c.live} onClick={swap}>
							<ArrowsClockwise aria-hidden />
							Swap person
						</button>
					</div>
				</div>
			) : (
				<div className="wa-guess">
					<form className="mm-row" onSubmit={ask}>
						<input
							className="input"
							value={q}
							maxLength={LIMITS.answer}
							autoComplete="off"
							aria-label="Type a question"
							placeholder="Type a question, or just ask out loud"
							disabled={!c.live}
							onChange={(e) => setQ(e.target.value)}
						/>
						<button className="btn paper" disabled={!q.trim() || !c.live}>
							Ask
						</button>
					</form>
					<form className="mm-row" onSubmit={tryGuess}>
						<input
							className="input"
							value={guess}
							maxLength={LIMITS.answer}
							autoComplete="off"
							aria-label="Your guess"
							placeholder="Your guess"
							disabled={!c.live}
							onChange={(e) => setGuess(e.target.value)}
						/>
						<button className="btn" disabled={!guess.trim() || !c.live}>
							Guess
						</button>
					</form>
					<button className="btn ghost sm wa-giveup" disabled={!c.live} onClick={() => play("giveup")}>
						Give up
					</button>
				</div>
			)}

			{s.wrong.length > 0 && (
				<p className="wa-wrong" aria-live="polite">
					{s.wrong.map((w, i) => (
						<span key={i} className="chip">
							Not {w}
						</span>
					))}
				</p>
			)}

			{asked > 0 && (
				<ol className="wa-log" aria-label="Questions so far">
					{s.log
						.map((e, i) => ({ ...e, n: i + 1 }))
						.reverse()
						.map((e) => (
							<li key={e.n} className={cls("wa-entry", !e.a && "waiting")}>
								<span className="wa-n">{e.n}</span>
								<span className="wa-text">{e.q ?? "Asked out loud"}</span>
								<span className={cls("wa-chip", e.a)}>{e.a ? ANSWERS.find(([a]) => a === e.a)![1] : "…"}</span>
							</li>
						))}
				</ol>
			)}
		</div>
	);
}
