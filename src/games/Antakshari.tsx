import { MicrophoneStage, MusicNotes, SkipForward } from "@phosphor-icons/react";
import { other, type Who } from "../../shared/types";
import { Head } from "../Character";
import { serverNow } from "../room";
import { cls, commit, Timer, useCountdown, useTimeUp, type Base, type Ctx } from "./lead";

/* Antakshari: sing a song that starts with the letter on screen, then pick the letter your song ended on;
   now it's their turn. 30 seconds to start singing. No secret, so the singer's browser just keeps the turn. */

const TURN = 30;
// Starting sounds of Hindi songs, written the way people say them
const LETTERS = ["A", "B", "Bh", "Ch", "D", "Dh", "E", "G", "H", "I", "J", "K", "Kh", "L", "M", "N", "O", "P", "R", "S", "Sh", "T", "U", "V", "Y", "Z"];
const STARTERS = ["M", "P", "T", "K", "D", "J", "S", "B", "H", "A", "Ch", "Y"];
const any = (from: string[], not?: string) => {
	const pool = from.filter((l) => l !== not);
	return pool[Math.floor(Math.random() * pool.length)];
};

export type Antakshari = Base & { phase: "ready" | "sing" | "pick" | "late"; letter: string; endsAt?: number; sung: number };
/** Whoever opens the game sings first, starting on a classic letter. */
export const antakshariInit = (starter: Who): Antakshari => ({ lead: starter, starter, round: 0, acks: [], phase: "ready", letter: any(STARTERS), sung: 0 });
const turn = (st: Antakshari, letter: string, sung: number): Antakshari => ({
	...st,
	lead: other(st.lead),
	round: st.round + 1,
	acks: [],
	phase: "sing",
	letter,
	endsAt: serverNow() + TURN * 1000,
	sung,
});

export const antakshariStatus = (s: Antakshari, you: Who, name: (w: Who) => string) =>
	s.lead === you ? (s.phase === "late" ? "Time's up" : "Your turn to sing") : `${name(s.lead)}'s turn to sing`;

export default function AntakshariGame({ c }: { c: Ctx }) {
	const s = c.game.state as Antakshari;
	const singing = s.lead === c.you;
	const left = useCountdown(s.phase === "sing" ? s.endsAt : undefined);
	useTimeUp<Antakshari>(c, s, s.phase === "sing", (st) => (st.phase === "sing" ? { ...st, phase: "late" } : null));

	const start = () => commit<Antakshari>(c.game, (st) => (st.phase === "ready" ? { ...st, phase: "sing", endsAt: serverNow() + TURN * 1000 } : null));
	const sung = () => commit<Antakshari>(c.game, (st) => (st.phase === "sing" ? { ...st, phase: "pick" } : null));
	const pass = () => commit<Antakshari>(c.game, (st) => (st.phase === "sing" ? { ...st, phase: "late" } : null));
	const hand = (letter: string) => commit<Antakshari>(c.game, (st) => (st.phase === "pick" ? turn(st, letter, st.sung + 1) : null));
	// Missed it: the other one gets a fresh letter
	const fresh = () => commit<Antakshari>(c.game, (st) => (st.phase === "late" ? turn(st, any(STARTERS, st.letter), st.sung) : null));

	return (
		<div className="ak">
			<div className={cls("ak-stage", s.phase === "late" && "late")}>
				<i className="stars" />
				<span className="ak-letter" key={`${s.round}${s.letter}`} aria-label={`The letter is ${s.letter}`}>
					{s.letter}
				</span>
				{s.phase === "sing" && (
					<span className="ak-timer">
						<Timer left={left} total={TURN} />
					</span>
				)}
				<span className="ak-singer" aria-hidden="true">
					<Head who={s.lead} mood={s.phase === "late" ? "aww" : s.phase === "sing" ? "bob" : "idle"} h="6em" />
				</span>
				{s.sung > 0 && (
					<span className="chip glass ak-count">
						<MusicNotes aria-hidden />
						{s.sung} {s.sung === 1 ? "song" : "songs"} so far
					</span>
				)}
			</div>

			<p className="ak-say" aria-live="polite">
				{s.phase === "ready" && (singing ? `You start. Sing a song that begins with "${s.letter}".` : `${c.name(s.lead)} starts with "${s.letter}".`)}
				{s.phase === "sing" && (singing ? `Sing a song that starts with "${s.letter}"!` : `${c.name(s.lead)} is singing. Listen for the last letter.`)}
				{s.phase === "pick" && (singing ? "Which letter did your song end on?" : `${c.name(s.lead)} is picking your letter`)}
				{s.phase === "late" && (singing ? "No song in time. It's their turn with a new letter." : `${c.name(s.lead)} ran out of time. Your turn!`)}
			</p>

			{singing && s.phase === "ready" && (
				<button className="btn" disabled={!c.live} onClick={start}>
					<MicrophoneStage aria-hidden />
					I'm ready
				</button>
			)}
			{singing && s.phase === "sing" && (
				<div className="wa-row">
					<button className="btn" onClick={sung}>
						<MusicNotes aria-hidden />
						Sung it!
					</button>
					<button className="btn ghost" onClick={pass}>
						<SkipForward aria-hidden />
						I'm stuck
					</button>
				</div>
			)}
			{singing && s.phase === "pick" && (
				<div className="ak-grid" role="group" aria-label="The last letter of your song">
					{LETTERS.map((l) => (
						<button key={l} className="ak-key" onClick={() => hand(l)}>
							{l}
						</button>
					))}
				</div>
			)}
			{s.phase === "late" && (
				<button className="btn" disabled={!c.live} onClick={fresh}>
					{singing ? `Give ${c.name(other(c.you))} a new letter` : "My turn: new letter"}
				</button>
			)}
		</div>
	);
}
