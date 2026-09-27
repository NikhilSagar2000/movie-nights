import { useState, type FormEvent } from "react";
import { ArrowsClockwise, Backspace, Check, PaperPlaneTilt } from "@phosphor-icons/react";
import { LIMITS, other, type Who } from "../../shared/types";
import { Head } from "../Character";
import { emojiOnly } from "../gameLogic";
import { MOVIES } from "./decks/movies";
import { SONGS } from "./decks/songs";
import { commit, draw, Finish, named, nextRound, onPlay, secretFor, sendPlay, useSecret, type Base, type Ctx } from "./lead";

/* Emoji Movie: the lead gets a movie or a song and describes it with emojis only; the other one types guesses,
   which the lead's browser checks. */

type Secret = { t: string; aka?: string[]; kind: "movie" | "song"; from?: string };
export type EmojiMovie = Base & { phase: "writing" | "guessing" | "done"; kind?: Secret["kind"]; clue: string; wrong: string[]; done?: { title: string; from?: string; guessed: boolean } };
const fresh = (b: Base): EmojiMovie => ({ ...b, phase: "writing", clue: "", wrong: [] });
/** Whoever opens the game guesses first. */
export const emojiInit = (starter: Who): EmojiMovie => fresh({ lead: other(starter), starter, round: 0, acks: [] });
const pick = (): Secret => {
	if (Math.random() < 0.7) {
		const m = draw("movies", MOVIES, (x) => x.t);
		return { t: m.t, aka: m.aka, kind: "movie" };
	}
	const s = draw("songs", SONGS, (x) => x.t);
	return { t: s.t, aka: s.aka, kind: "song", from: s.from };
};
const reveal = (x: Secret, guessed: boolean) => ({ title: x.t, from: x.from, guessed });

onPlay<EmojiMovie>("emoji", (s, p, g) => {
	if (s.phase !== "guessing") return null;
	const secret = secretFor(g, s.round, pick);
	if (p.act === "giveup") return { ...s, phase: "done", done: reveal(secret, false) };
	const v = String(p.v ?? "").trim().slice(0, LIMITS.answer);
	if (p.act !== "guess" || !v) return null;
	return named(v, secret.t, secret.aka) ? { ...s, phase: "done", done: reveal(secret, true) } : { ...s, wrong: [...s.wrong, v].slice(-8) };
});

export const emojiStatus = (s: EmojiMovie, you: Who, name: (w: Who) => string) =>
	s.phase === "done" ? "Round over" : s.lead === you ? `You make the emoji clue. ${name(other(you))} guesses` : `${name(s.lead)} makes the clue. You guess`;

// A little palette for laptops without an emoji keyboard handy.
const PALETTE = [
	...new Intl.Segmenter().segment(
		"😀😂🥲😍😎🤓😱😭😡🥶🤯😴🤔🤫🥳👻🤖👽💀🤡👑💍💃🕺🏃🧙🦸🦹👮👩‍⚕️👨‍🍳👸🤴👶👴❤️💔🔥💧⚡🌙☀️⭐🌈❄️🌊🌹🌸🌴🐘🐯🦁🐍🐒🐶🐱🐎🦅🐟🚗🚂✈️🚢🚀🏍️🏠🏰🏫🏥🕌🛕⛪🗽🎬🎵🎤🎸🥁📚✏️💰💎⌚📱💻🏏⚽🏆🎓🎂🍿🍕☕🍵🍛🍫👀👂👄✋👊🙏💪➕➖❓❗💯🔟🇮🇳",
	),
].map((x) => x.segment);

export default function EmojiMovieGame({ c }: { c: Ctx }) {
	const s = c.game.state as EmojiMovie;
	const leading = s.lead === c.you;
	const guesser = other(s.lead);
	const secret = useSecret(c, s, pick);
	const [draft, setDraft] = useState("");
	const [guess, setGuess] = useState("");

	const send = () => {
		const add = emojiOnly(draft).trim();
		if (!add) return;
		commit<EmojiMovie>(c.game, (st) =>
			st.phase === "done" ? null : { ...st, phase: "guessing", kind: secret?.kind, clue: emojiOnly(st.clue ? `${st.clue} ${add}` : add, 60).trim() },
		);
		setDraft("");
	};
	const thatsIt = () => secret && commit<EmojiMovie>(c.game, (st) => (st.phase === "guessing" ? { ...st, phase: "done", done: reveal(secret, true) } : null));
	const tryGuess = (e: FormEvent) => {
		e.preventDefault();
		const v = guess.trim().slice(0, LIMITS.answer);
		if (!v || !c.live) return;
		sendPlay(c.game, s.round, "guess", v);
		setGuess("");
	};

	if (s.phase === "done" && s.done)
		return (
			<div className="em">
				<Finish
					text={s.done.guessed ? `${guesser === c.you ? "You" : c.name(guesser)} got it: ${s.done.title}` : `It was ${s.done.title}`}
					sub={`${s.done.from ? `From ${s.done.from}. ` : ""}Next round, ${s.lead === c.you ? "you guess" : `${c.name(s.lead)} guesses`}.`}
					sad={!s.done.guessed}
					button="Next round"
					onNext={() => nextRound(c.game, fresh)}
				/>
				{s.clue && <p className="em-clue small">{s.clue}</p>}
			</div>
		);

	return (
		<div className="em">
			{leading && secret && (
				<div className="wa-card knows em-secret">
					<span className="wa-card-top">
						Describe this {secret.kind} with emojis only{secret.from ? `, from ${secret.from}` : ""}
					</span>
					<strong className="wa-name">{secret.t}</strong>
				</div>
			)}
			{s.phase === "guessing" ? (
				<div className="em-board">
					<span className="chip fog">A {s.kind ?? "movie"}</span>
					<p className="em-clue" aria-label={`Emoji clue: ${s.clue}`}>
						{s.clue}
					</p>
				</div>
			) : (
				!leading && (
					<div className="em-board waiting">
						<Head who={s.lead} mood={c.live ? "ponder" : "away"} h="6em" />
						<p>{c.name(s.lead)} is picking emojis</p>
					</div>
				)
			)}

			{leading ? (
				<div className="em-write">
					<div className="mm-row">
						<input
							className="input em-input"
							value={draft}
							aria-label="Emoji clue"
							placeholder={s.phase === "guessing" ? "Add more emojis" : "Emojis only"}
							onChange={(e) => setDraft(emojiOnly(e.target.value))}
							onKeyDown={(e) => e.key === "Enter" && send()}
						/>
						<button className="btn icon ghost" aria-label="Delete the last emoji" disabled={!draft} onClick={() => setDraft([...new Intl.Segmenter().segment(draft)].slice(0, -1).map((x) => x.segment).join(""))}>
							<Backspace aria-hidden />
						</button>
						<button className="btn" disabled={!draft.trim() || !c.live} onClick={send}>
							<PaperPlaneTilt aria-hidden />
							{s.phase === "guessing" ? "Add" : "Send clue"}
						</button>
					</div>
					<div className="em-palette" role="group" aria-label="Emoji palette">
						{PALETTE.map((e) => (
							<button key={e} className="em-key" onClick={() => setDraft((d) => emojiOnly(d + e))}>
								{e}
							</button>
						))}
					</div>
					<div className="wa-row">
						{s.phase === "guessing" ? (
							<button className="btn" disabled={!c.live} onClick={thatsIt}>
								<Check aria-hidden />
								That's it! (they said it)
							</button>
						) : (
							<button className="btn ghost" onClick={() => nextRound(c.game, fresh, s.lead)}>
								<ArrowsClockwise aria-hidden />
								Another one
							</button>
						)}
					</div>
				</div>
			) : (
				s.phase === "guessing" && (
					<div className="wa-guess">
						<form className="mm-row" onSubmit={tryGuess}>
							<input
								className="input"
								value={guess}
								maxLength={LIMITS.answer}
								autoComplete="off"
								aria-label="Your guess"
								placeholder={`Which ${s.kind ?? "movie"} is it?`}
								disabled={!c.live}
								onChange={(e) => setGuess(e.target.value)}
							/>
							<button className="btn" disabled={!guess.trim() || !c.live}>
								Guess
							</button>
						</form>
						<button className="btn ghost sm wa-giveup" disabled={!c.live} onClick={() => sendPlay(c.game, s.round, "giveup")}>
							Give up
						</button>
					</div>
				)
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
		</div>
	);
}
