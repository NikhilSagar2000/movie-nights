import { Check, Megaphone, Prohibit, SkipForward } from "@phosphor-icons/react";
import { other, type Who } from "../../shared/types";
import { serverNow } from "../room";
import { CARDS, type Card } from "./decks/cards";
import { cls, commit, draw, Finish, nextRound, onPlay, secretFor, sendPlay, Timer, useCountdown, useFlash, useSecret, useTimeUp, type Base, type Ctx } from "./lead";

/* Don't Say It (Taboo): the lead describes the word on their card without saying it or its four banned words;
   the other one guesses out loud. A minute a round, then swap. The lead's browser holds the shuffled cards. */

const ROUND = 60;
export type DontSayIt = Base & { phase: "ready" | "play" | "done"; endsAt?: number; got: string[]; skipped: string[]; buzzes: number };
const fresh = (b: Base): DontSayIt => ({ ...b, phase: "ready", got: [], skipped: [], buzzes: 0 });
/** Whoever opens the game describes first. */
export const tabooInit = (starter: Who): DontSayIt => fresh({ lead: starter, starter, round: 0, acks: [] });
const deal = () => Array.from({ length: 40 }, () => draw("cards", CARDS, (c) => c.w));
const current = (s: DontSayIt, deck: Card[]) => deck[(s.got.length + s.skipped.length) % deck.length];

// The guesser heard a banned word: that card goes to the skipped pile.
onPlay<DontSayIt>("taboo", (s, p, g) => {
	if (p.act !== "buzz" || s.phase !== "play") return null;
	const card = current(s, secretFor(g, s.round, deal));
	return { ...s, skipped: [...s.skipped, card.w], buzzes: s.buzzes + 1 };
});

export const tabooStatus = (s: DontSayIt, you: Who, name: (w: Who) => string) =>
	s.phase === "done" ? "Round over" : s.lead === you ? `You describe. ${name(other(you))} guesses` : `${name(s.lead)} describes. You guess out loud`;

export default function DontSayItGame({ c }: { c: Ctx }) {
	const s = c.game.state as DontSayIt;
	const leading = s.lead === c.you;
	const guesser = other(s.lead);
	const deck = useSecret(c, s, deal);
	const card = deck && current(s, deck);
	const left = useCountdown(s.phase === "play" ? s.endsAt : undefined);
	useTimeUp<DontSayIt>(c, s, s.phase === "play", (st) => (st.phase === "play" ? { ...st, phase: "done" } : null));
	const buzzed = useFlash(s.buzzes);

	const start = () => commit<DontSayIt>(c.game, (st) => (st.phase === "ready" ? { ...st, phase: "play", endsAt: serverNow() + ROUND * 1000 } : null));
	const mark = (got: boolean) =>
		deck &&
		commit<DontSayIt>(c.game, (st) => {
			if (st.phase !== "play") return null;
			const w = current(st, deck).w; // from the newest state, so a buzz in between can't mark the wrong card
			return got ? { ...st, got: [...st.got, w] } : { ...st, skipped: [...st.skipped, w] };
		});

	if (s.phase === "done") {
		const n = s.got.length;
		return (
			<div className="ds">
				<Finish
					text={n ? `${n} ${n === 1 ? "word" : "words"} in a minute` : "No words this time"}
					sub={`Next round, ${guesser === c.you ? "you describe" : `${c.name(guesser)} describes`}.`}
					sad={!n}
					button="Next round"
					onNext={() => nextRound(c.game, fresh)}
				/>
				<Piles s={s} />
			</div>
		);
	}

	if (s.phase === "ready")
		return (
			<div className="ds">
				<div className="ds-ready">
					<p>
						{leading ? (
							<>
								You describe, <b>{c.name(guesser)}</b> guesses out loud. Don't say the word or any of the banned ones.
							</>
						) : (
							<>
								<b>{c.name(s.lead)}</b> describes, you guess out loud. If they say a banned word, buzz them.
							</>
						)}
					</p>
					{leading ? (
						<button className="btn" disabled={!c.live} onClick={start}>
							Start the minute
						</button>
					) : (
						<span className="chip fog">Waiting for {c.name(s.lead)} to start</span>
					)}
				</div>
			</div>
		);

	return (
		<div className="ds">
			<div className="ds-top">
				<Timer left={left} total={ROUND} />
				<span className="ds-count">{s.got.length} got</span>
			</div>
			{leading ? (
				<>
					<div className={cls("ds-card", buzzed && "buzzed")} key={card?.w}>
						<strong className="ds-word">{card?.w ?? "…"}</strong>
						<ul className="ds-ban" aria-label="Don't say">
							{card?.ban.map((b) => (
								<li key={b}>
									<Prohibit aria-hidden />
									{b}
								</li>
							))}
						</ul>
						{buzzed && <span className="ds-buzz">Buzz! A banned word</span>}
					</div>
					<div className="wa-row">
						<button className="btn" onClick={() => mark(true)}>
							<Check aria-hidden />
							Got it
						</button>
						<button className="btn ghost" onClick={() => mark(false)}>
							<SkipForward aria-hidden />
							Skip
						</button>
					</div>
				</>
			) : (
				<>
					<div className="ds-card listen">
						<strong className="ds-word">Guess out loud!</strong>
						<p>{c.name(s.lead)} is describing</p>
					</div>
					<button className="btn blush" disabled={!c.live} onClick={() => sendPlay(c.game, s.round, "buzz")}>
						<Megaphone aria-hidden />
						Buzz: they said a banned word
					</button>
				</>
			)}
			<Piles s={s} />
		</div>
	);
}

/** The words done so far this round (public once they're done). */
function Piles({ s }: { s: DontSayIt }) {
	if (!s.got.length && !s.skipped.length) return null;
	return (
		<div className="ds-piles">
			{s.got.map((w) => (
				<span key={`g${w}`} className="chip sage">
					{w}
				</span>
			))}
			{s.skipped.map((w) => (
				<span key={`s${w}`} className="chip ds-skipped">
					{w}
				</span>
			))}
		</div>
	);
}
