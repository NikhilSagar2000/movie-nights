// Reading a letter that came with a gift: the parcel lands, a tap unwraps it (ribbon off, bouquet up, lid off, letter
// out), then the bouquet, the letter and the open box. The person it was for can eat the chocolates, one tap each.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { other, type Letter } from "../shared/types";
import { chocolatesLeft } from "../shared/gift";
import { Head } from "./Character";
import { profileOf, send, type RoomState } from "./room";
import { BouquetArt, ChocolateBox } from "./giftArt";
import { GiftScene, useSteps, type ScenePhase } from "./GiftScene";
import { longDate, type Phase as EnvPhase } from "./envelope";

type Step = "untie" | "spread" | "lift" | "open" | "out" | "gone" | "read";
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

export default function GiftLetter({ room, letter, onOpened, bar }: { room: RoomState; letter: Letter; onOpened: () => void; bar: ReactNode }) {
	const gift = letter.gift!;
	const mine = letter.from === room.you;
	const from = profileOf(room, letter.from);
	const to = profileOf(room, other(letter.from));
	const hasNote = !!letter.text;
	const [tapped, setTapped] = useState(() => reduced());
	const steps: [Step, number][] = hasNote
		? [["untie", 0], ["spread", 1500], ["lift", 2500], ["open", 3300], ["out", 4200], ["gone", 5300], ["read", 5500]]
		: [["untie", 0], ["spread", 1500], ["lift", 2500], ["read", 4000]];
	const step = useSteps(steps, tapped, reduced());
	useEffect(() => void (tapped && onOpened()), [tapped]);

	if (step !== "read") {
		const phase: ScenePhase = !step ? "parcel" : step === "untie" ? "untie" : "spread";
		const env: EnvPhase = step === "open" ? "open" : step === "out" ? "out" : step === "gone" ? "gone" : "closed";
		const lid = !step || step === "untie" || step === "spread" ? "closed" : "lifting";
		return (
			<div className="lt-scene gs-arrival">
				<GiftScene
					gift={gift}
					note={hasNote ? { paper: letter.paper, from: letter.from, to: to.name } : null}
					phase={phase}
					env={env}
					lid={lid}
					button
					onTap={step ? undefined : () => setTapped(true)}
					label={step ? undefined : mine ? `Open your gift for ${to.name}` : `Open the gift from ${from.name}`}
				/>
				<p className={`lt-hint${step ? " hide" : ""}`}>{mine ? "Tap to open it again" : `${from.name} left you a gift. Tap to open it.`}</p>
			</div>
		);
	}
	return <GiftRead room={room} letter={letter} bar={bar} />;
}

function GiftRead({ room, letter, bar }: { room: RoomState; letter: Letter; bar: ReactNode }) {
	const gift = letter.gift!;
	const mine = letter.from === room.you;
	const from = profileOf(room, letter.from);
	const to = profileOf(room, other(letter.from));
	const [ate, setAte] = useState<number[]>([]); // shows a chocolate gone before the Room confirms it
	const root = useRef<HTMLDivElement>(null);
	useEffect(() => root.current?.querySelector<HTMLButtonElement>(".lt-read-bar button:last-child")?.focus(), []); // keyboard lands on Close / Next
	const eatenNow = [...new Set([...(gift.chocolates?.eaten ?? []), ...ate])];
	const box = gift.chocolates && { ...gift.chocolates, eaten: eatenNow };
	const left = chocolatesLeft(box ? { chocolates: box } : undefined);
	const eat = (i: number) => {
		setAte((a) => [...a, i]);
		send({ t: "letter:eat", id: letter.id, i });
	};
	const parts = `${gift.bouquet ? "b" : ""}${letter.text ? "n" : ""}${gift.chocolates ? "c" : ""}`;
	return (
		<div ref={root} className="lt-reading gs-read" data-parts={parts}>
			{gift.bouquet && (
				<div className="gs-read-bouquet">
					<BouquetArt b={gift.bouquet} />
				</div>
			)}
			{letter.text && (
				<div className="lt-sheet gs-read-note">
					<span className="lt-peek" aria-hidden="true">
						<Head who={letter.from} moment="arrive" twinkle h="4.6em" />
					</span>
					<div className="lt-paper lt-open" data-paper={letter.paper}>
						<p className="lt-date">{longDate(letter.at)}</p>
						<p className="lt-for">For {to.name}</p>
						<p className="lt-body">{letter.text}</p>
						<p className="lt-sign">{from.name}</p>
					</div>
				</div>
			)}
			{box && left && (
				<div className="gs-read-box">
					<ChocolateBox
						c={box}
						onEat={mine ? undefined : eat}
						cellLabel={(i) => (box.pieces[i] && !eatenNow.includes(i) ? `Eat the ${box.pieces[i]!.flavor} ${box.pieces[i]!.shape} chocolate` : "An empty cup")}
					/>
					<p className="gs-left">
						{left.left === 0 ? (
							mine ? `${to.name} ate every one` : "All eaten"
						) : (
							<>
								{!mine && "Tap one to eat it · "}
								<b key={left.left} className="gs-count">
									{left.left}
								</b>{" "}
								of {left.total} left
							</>
						)}
					</p>
				</div>
			)}
			{!letter.text && (
				<p className="gs-from">
					From <b>{from.name}</b>, {longDate(letter.at)}
				</p>
			)}
			{bar}
		</div>
	);
}
