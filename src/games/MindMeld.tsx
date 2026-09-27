import { useEffect, useState, type FormEvent } from "react";
import { LIMITS, type Who } from "../../shared/types";
import { Duo, Flower, FlowerBurst, type HeadProps } from "../Character";
import { mindMeldMatch } from "../gameLogic";
import { cls, vars, type Ctx } from "./lead";

export default function MindMeld({ c }: { c: Ctx }) {
	const rv = c.game.reveals;
	const last = rv.at(-1);
	const synced = !!last && mindMeldMatch(last.a, last.b);
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