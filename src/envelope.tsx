// The letter's envelope (sealed with his flower), shared by the letter reader and the gift scenes.
import type { LetterPaper, Who } from "../shared/types";
import { Face, Flower } from "./Character";

export const longDate = (ms: number) => new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "long" });

/** closed: sealed · open: flap up, seal gone · out: the letter slides up · gone: it drops away (you're reading) · fly: sent off */
export type Phase = "closed" | "open" | "out" | "gone" | "fly";

export function Envelope({ phase, paper, from, to, label, onOpen }: { phase: Phase; paper: LetterPaper; from: Who; to: string; label?: string; onOpen?: () => void }) {
	const body = (
		<>
			<span className="lt-env-back" />
			<span className="lt-env-letter" />
			<span className="lt-env-pocket">
				<span className="lt-env-to">For {to}</span>
				<span className="lt-stamp">
					<Face who={from} s="100%" rw="0" mood="still" />
				</span>
			</span>
			<span className="lt-env-flap" />
			<span className="lt-seal">
				<Flower />
			</span>
		</>
	);
	return onOpen ? (
		<button className={`lt-env ${phase}`} data-paper={paper} aria-label={label} onClick={onOpen}>
			{body}
		</button>
	) : (
		<span className={`lt-env ${phase}`} data-paper={paper} aria-hidden="true">
			{body}
		</span>
	);
}

