import { useEffect } from "react";
import { Check, SkipForward } from "@phosphor-icons/react";
import { other, type Who } from "../../shared/types";
import { Face } from "../Character";
import { serverNow } from "../room";
import { useCall } from "../rtc";
import { useLive, useVideo } from "../Theater";
import { MOVIES } from "./decks/movies";
import { commit, draw, Finish, nextRound, Timer, useCountdown, useSecret, useTimeUp, type Base, type Ctx } from "./lead";

/* Dumb Charades: the lead acts out a movie on camera without speaking; the other one watches their camera, big, and
   guesses out loud. Two minutes, then swap. "Pass" draws another movie without stopping the clock. */

const ROUND = 120;
export type Charades = Base & { phase: "ready" | "play" | "done"; endsAt?: number; passes: number; result?: "got" | "time"; title?: string; tag?: string };
const fresh = (b: Base): Charades => ({ ...b, phase: "ready", passes: 0 });
/** Whoever opens the game acts first. */
export const charadesInit = (starter: Who): Charades => fresh({ lead: starter, starter, round: 0, acks: [] });
const pick = () => draw("movies", MOVIES, (m) => m.t);
const words = (t: string) => t.split(/\s+/).filter(Boolean).length;

export const charadesStatus = (s: Charades, you: Who, name: (w: Who) => string) =>
	s.phase === "done" ? "Round over" : s.lead === you ? `You act. ${name(other(you))} guesses` : `${name(s.lead)} acts. You guess out loud`;

export default function CharadesGame({ c }: { c: Ctx }) {
	const s = c.game.state as Charades;
	const leading = s.lead === c.you;
	const guesser = other(s.lead);
	const movie = useSecret(c, s, pick, `${s.round}.${s.passes}`);
	const left = useCountdown(s.phase === "play" ? s.endsAt : undefined);
	const reveal = movie ? { title: movie.t, tag: movie.tag } : {}; // only the actor knows it
	useTimeUp<Charades>(c, s, s.phase === "play", (st) => (st.phase === "play" ? { ...st, phase: "done", result: "time", ...reveal } : null));
	// time ran out while the lead was away: their browser fills in the title when it next sees the round
	useEffect(() => {
		if (leading && movie && s.phase === "done" && !s.title) commit<Charades>(c.game, (st) => (st.phase === "done" && !st.title ? { ...st, title: movie.t, tag: movie.tag } : null));
	}, [leading, movie, s.phase, s.title, c.game]);

	const start = () => commit<Charades>(c.game, (st) => (st.phase === "ready" ? { ...st, phase: "play", endsAt: serverNow() + ROUND * 1000 } : null));
	const pass = () => commit<Charades>(c.game, (st) => (st.phase === "done" ? null : { ...st, passes: st.passes + 1 }));
	const got = () => movie && commit<Charades>(c.game, (st) => (st.phase === "play" ? { ...st, phase: "done", result: "got", title: movie.t, tag: movie.tag } : null));

	if (s.phase === "done")
		return (
			<Finish
				text={s.result === "got" ? `Got it: ${s.title ?? "…"}` : s.title ? `Time's up. It was ${s.title}` : "Time's up"}
				sub={`Next round, ${guesser === c.you ? "you act" : `${c.name(guesser)} acts`}.`}
				sad={s.result !== "got"}
				button="Next round"
				onNext={() => nextRound(c.game, fresh)}
			/>
		);

	return (
		<div className="dc">
			<div className="dc-stage">
				<Cam c={c} who={s.lead} />
				{s.phase === "play" && (
					<span className="dc-timer">
						<Timer left={left} total={ROUND} />
					</span>
				)}
				{!leading && s.phase === "ready" && <span className="dc-wait">{c.name(s.lead)} is getting a movie ready</span>}
			</div>
			{leading && movie && (
				<div className="dc-card">
					<span className="chip fog">{movie.tag}</span>
					<strong className="dc-title">{movie.t}</strong>
					<span className="dc-words">
						{words(movie.t)} {words(movie.t) === 1 ? "word" : "words"}
					</span>
				</div>
			)}
			{leading && (
				<div className="wa-row">
					{s.phase === "ready" ? (
						<button className="btn" disabled={!c.live} onClick={start}>
							Start the clock
						</button>
					) : (
						<button className="btn" onClick={got}>
							<Check aria-hidden />
							They got it
						</button>
					)}
					<button className="btn ghost" onClick={pass}>
						<SkipForward aria-hidden />
						Pass (another movie)
					</button>
				</div>
			)}
		</div>
	);
}

/** The actor's camera: big for the guesser (muted, their bubble already plays the voice), a mirror for the actor. */
function Cam({ c, who }: { c: Ctx; who: Who }) {
	const call = useCall();
	const mine = who === c.you;
	const stream = mine ? call.localCam : call.remoteCam;
	const video = useVideo(stream, true);
	const live = useLive(mine ? null : stream);
	const showing = mine ? call.camOn && !!call.localCam?.getVideoTracks().length : live && call.peerCamOn && c.live;
	return (
		<div className={`dc-cam${mine ? " mine" : ""}`}>
			<video ref={video.ref} playsInline muted className={showing ? "" : "off"} aria-label={mine ? "Your camera" : `${c.name(who)}'s camera`} />
			{!showing && (
				<span className="dc-cam-off">
					<Face who={who} s="7em" mood={c.live || mine ? "idle" : "away"} />
					<span>{mine ? "Turn your camera on to act" : `${c.name(who)}'s camera is off`}</span>
				</span>
			)}
		</div>
	);
}
