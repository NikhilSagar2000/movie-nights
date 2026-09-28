// Leave a note (#/note): a letter, and if you like a bouquet you arrange and a box of chocolates you fill. The table on
// the left shows the whole set as you go; Send wraps it into a parcel that flies off to the other person.
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { ArrowLeft, Check, Gift, PaperPlaneTilt, Plus, Shuffle, X } from "@phosphor-icons/react";
import { LIMITS, other, PAPERS, type LetterPaper } from "../shared/types";
import { BOX_SIZES, cleanGift, FLAVORS, FLOWERS, FLOWER_IDS, MAX_STEMS, SHAPES, TOPS, WRAPS, type Bouquet, type Choc, type Chocolates, type FlowerId, type Gift as GiftT } from "../shared/gift";
import { profileOf, send, useRoom } from "./room";
import { ChocolateBox, FLAVOR_FILL, FlowerHead, Piece, type BoxAnim } from "./giftArt";
import { boxLayout } from "./giftLayout";
import { GiftScene, Petals, useSteps, type ScenePhase } from "./GiftScene";
import type { Phase as EnvPhase } from "./envelope";
import { Flower } from "./Character";
import { Pills, Swatches, type Swatch } from "./Pickers";
import "./gift.css";

// ---------- names and palettes ----------
const FLOWER_NAMES: Record<FlowerId, string> = {
	rose: "Rose",
	tulip: "Tulip",
	tuberose: "Tuberose",
	sunflower: "Sunflower",
	daisy: "Daisy",
	lily: "Lily",
	lavender: "Lavender",
	gypsophila: "Baby's breath",
	little: "Frangipani",
};
const COLOR_NAMES: Record<string, string> = {
	"#d64550": "red",
	"#e0506a": "red",
	"#f4a3b4": "pink",
	"#fff7e6": "cream",
	"#fffcf5": "white",
	"#f6b48f": "peach",
	"#f7dd8d": "yellow",
	"#a98bd6": "purple",
	"#c3b1e1": "lilac",
	"#f5c23a": "golden",
	"#f7c8d3": "blush",
	"#f6a15c": "orange",
	"#9b86c9": "purple",
};
const WRAP_NAMES: Record<Bouquet["wrap"], string> = { kraft: "Kraft paper", tissue: "Tissue", clear: "Cellophane", news: "Newsprint" };
const TISSUES: Swatch[] = [["#f7c8d3", "Blush"], ["#a8cbd8", "Sky"], ["#c3b1e1", "Lilac"], ["#f7dd8d", "Butter"], ["#b9c79c", "Sage"], ["#fff7e6", "Cream"], ["#a9b7c6", "Misty gray"], ["#52657a", "Slate"]];
const RIBBONS: Swatch[] = [["#b46a72", "Rosewood"], ["#d64550", "Red"], ["#f4a3b4", "Pink"], ["#f7c8d3", "Blush"], ["#e8c35a", "Gold"], ["#a8b58a", "Sage"], ["#fff7e6", "Cream"], ["#a9b7c6", "Misty gray"], ["#52657a", "Slate"], ["#2d3a47", "Night"]];
const BOX_COLORS: Swatch[] = [["#b46a72", "Rosewood"], ["#d64550", "Red"], ["#f7c8d3", "Blush"], ["#a8b58a", "Sage"], ["#c3b1e1", "Lilac"], ["#fff7e6", "Cream"], ["#a9b7c6", "Misty gray"], ["#52657a", "Slate"], ["#2d3a47", "Night"]];
const SHAPE_NAMES: Record<Choc["shape"], string> = { round: "Round", square: "Square", heart: "Heart", truffle: "Truffle" };
const FLAVOR_NAMES: Record<Choc["flavor"], string> = { dark: "Dark", milk: "Milk", white: "White", ruby: "Ruby", caramel: "Caramel" };
const TOP_NAMES: Record<Choc["top"], string> = { none: "Plain", drizzle: "Drizzle", nuts: "Nuts", sprinkles: "Sprinkles", gold: "Gold flakes" };
const PAPER_NAMES: Record<LetterPaper, string> = { cream: "Cream", mist: "Misty blue", blush: "Blush" };

// ---------- the draft (kept on this device until it's sent) ----------
type Draft = { text: string; paper: LetterPaper; bouquet: Bouquet | null; chocolates: Chocolates | null };
type Tab = "note" | "flowers" | "chocolates";
const TABS: Tab[] = ["note", "flowers", "chocolates"];
const KEY = "gift-draft";
const newSeed = () => Math.floor(Math.random() * 2 ** 31);
const any = <T,>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)];
const randomChoc = (): Choc => ({ shape: any(SHAPES), flavor: any(FLAVORS), top: any(TOPS) });
const sameChoc = (a: Choc | null, b: Choc) => !!a && a.shape === b.shape && a.flavor === b.flavor && a.top === b.top;
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const storage = {
	get(k: string) {
		try {
			return localStorage.getItem(k);
		} catch {
			return null;
		}
	},
	set(k: string, v: string | null) {
		try {
			if (v === null) localStorage.removeItem(k);
			else localStorage.setItem(k, v);
		} catch {
			/* no storage: the draft just isn't kept */
		}
	},
};
function loadDraft(): Draft {
	const empty: Draft = { text: "", paper: "cream", bouquet: null, chocolates: null };
	try {
		const d = JSON.parse(storage.get(KEY) ?? "null") as Partial<Draft> | null;
		if (d && typeof d === "object")
			// a draft from another version could be anything: keep only what the Room would accept, part by part
			return {
				text: typeof d.text === "string" ? d.text : "",
				paper: PAPERS.includes(d.paper as LetterPaper) ? (d.paper as LetterPaper) : "cream",
				bouquet: cleanGift({ bouquet: d.bouquet })?.bouquet ?? null,
				chocolates: cleanGift({ chocolates: d.chocolates })?.chocolates ?? null,
			};
	} catch {
		/* a broken draft starts over */
	}
	// a note started before gifts existed
	const paper = storage.get("letter-paper") as LetterPaper | null;
	return { ...empty, text: storage.get("letter-draft") ?? "", paper: paper && PAPERS.includes(paper) ? paper : "cream" };
}
const starterBouquet = (): Bouquet => ({
	stems: [
		{ f: "rose", c: "#d64550" },
		{ f: "rose", c: "#f4a3b4" },
		{ f: "tulip", c: "#f4a3b4" },
		{ f: "gypsophila", c: "#fffcf5" },
		{ f: "rose", c: "#d64550" },
	],
	wrap: "tissue",
	wrapColor: "#f7c8d3",
	ribbon: "#b46a72",
	seed: newSeed(),
});
const starterBox = (): Chocolates => ({ size: 9, box: "heart", boxColor: "#b46a72", ribbon: "#f7c8d3", pieces: Array.from({ length: 9 }, randomChoc) });
/** What would be sent: an empty bouquet or box isn't a gift. */
const giftOf = (d: Draft): GiftT | undefined => {
	const bouquet = d.bouquet?.stems.length ? d.bouquet : undefined;
	const chocolates = d.chocolates?.pieces.some(Boolean) ? d.chocolates : undefined;
	return bouquet || chocolates ? { ...(bouquet && { bouquet }), ...(chocolates && { chocolates }) } : undefined;
};

type SendStep = "out" | "in" | "sealed" | "tie" | "gather" | "fly" | "done";
/** The send-off, slow enough to watch: the letter goes in, the lid and bows, the parcel is tied, a beat, then away. */
const SEND: [SendStep, number][] = [
	["out", 0],
	["in", 250],
	["sealed", 1400],
	["tie", 2200],
	["gather", 3000],
	["fly", 5600],
	["done", 7500],
];

export default function GiftBuilder() {
	const room = useRoom();
	const [draft, setDraft] = useState<Draft>(loadDraft);
	const [tab, setTab] = useState<Tab>("note");
	const [dir, setDir] = useState(1);
	const [fresh, setFresh] = useState<ReadonlySet<number>>(new Set());
	const [leaving, setLeaving] = useState<ReadonlySet<number>>(new Set());
	const [boxAnim, setBoxAnim] = useState<BoxAnim>(null);
	const [brush, setBrush] = useState<Choc>({ shape: "heart", flavor: "ruby", top: "gold" });
	const [colors, setColors] = useState(() => Object.fromEntries(FLOWER_IDS.map((f) => [f, FLOWERS[f][0]])) as Record<FlowerId, string>);
	const [sending, setSending] = useState(0);
	const [sent, setSent] = useState<Draft | null>(null);
	const step = useSteps(SEND, sending, reduced());

	useEffect(() => {
		if (!sending) storage.set(KEY, JSON.stringify(draft));
	}, [draft]);
	useEffect(() => {
		if (!fresh.size) return;
		const t = setTimeout(() => setFresh(new Set()), 700);
		return () => clearTimeout(t);
	}, [fresh]);

	if (!room) return null;
	const to = profileOf(room, other(room.you));
	const me = profileOf(room, room.you);
	const partnerHere = room.online.some((p) => p.who === other(room.you));
	const put = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
	const b = draft.bouquet,
		c = draft.chocolates;
	const shown = sent ?? draft;
	const gift = giftOf(shown);
	const text = draft.text.trim().slice(0, LIMITS.letter);
	const canSend = !!text || !!giftOf(draft);

	// ---------- bouquet ----------
	const setB = (patch: Partial<Bouquet>) => b && put({ bouquet: { ...b, ...patch } });
	const addStem = (f: FlowerId) => {
		if (!b || b.stems.length >= MAX_STEMS) return;
		setB({ stems: [...b.stems, { f, c: colors[f] }] });
		setFresh(new Set([b.stems.length]));
	};
	const removeStem = (i: number) => {
		if (!b || leaving.has(i)) return;
		setLeaving(new Set([...leaving, i]));
		setTimeout(() => {
			setDraft((d) => (d.bouquet ? { ...d, bouquet: { ...d.bouquet, stems: d.bouquet.stems.filter((_, k) => k !== i) } } : d));
			setLeaving(new Set());
		}, reduced() ? 0 : 320);
	};

	// ---------- chocolates ----------
	const setC = (patch: Partial<Chocolates>) => c && put({ chocolates: { ...c, ...patch } });
	const bump = (kind: "drop" | "wave" | "flip", cells?: number[]) => setBoxAnim((a) => ({ kind, n: (a?.n ?? 0) + 1, cells }));
	const place = (i: number) => {
		if (!c) return;
		const pieces = [...c.pieces];
		pieces[i] = sameChoc(pieces[i], brush) ? null : { ...brush }; // tapping the same chocolate again takes it out
		setC({ pieces });
		if (pieces[i]) bump("drop", [i]);
	};
	const resize = (size: Chocolates["size"]) => c && setC({ size, pieces: Array.from({ length: size }, (_, i) => c.pieces[i] ?? null) });
	const fillEmpty = () => {
		if (!c) return;
		const empty = c.pieces.flatMap((p, i) => (p ? [] : [i]));
		setC({ pieces: c.pieces.map((p) => p ?? { ...brush }) });
		bump("wave", empty.length ? empty : undefined);
	};
	const mix = () => {
		if (!c) return;
		setC({ pieces: c.pieces.map(() => randomChoc()) });
		bump("flip");
	};

	// ---------- sending ----------
	function sendIt() {
		if (!canSend) return;
		const g = giftOf(draft);
		send({ t: "letter:send", text, paper: draft.paper, ...(g && { gift: g }) });
		storage.set(KEY, null);
		storage.set("letter-draft", null);
		setSent(draft);
		setSending((n) => n + 1);
	}
	const again = () => {
		setDraft({ text: "", paper: draft.paper, bouquet: null, chocolates: null });
		setSent(null);
		setSending(0);
		setTab("note");
	};
	const phase: ScenePhase = !step ? "preview" : step === "gather" ? "gather" : step === "fly" || step === "done" ? "fly" : "seal";
	const env: EnvPhase = step === "out" ? "out" : step === "in" ? "open" : "closed";
	const lid = !step ? "open" : step === "out" || step === "in" ? "open" : step === "sealed" ? "closing" : "closed";
	const showNote = !!shown.text.trim() || !gift;
	const pick = (t: Tab) => {
		setDir(TABS.indexOf(t) >= TABS.indexOf(tab) ? 1 : -1);
		setTab(t);
	};
	const done = step === "done";

	return (
		<main className="page gb-page">
			<div className="gb-look">
				<div className="arch gb-stage">
					<i className="stars" />
					<i className="moon gb-moon" />
					<i className="gb-cloth" />
					{done ? (
						<div className="gb-done" role="status">
							<Petals kind="fall" n={18} />
							<Flower className="gb-done-flower" />
							<h2>On its way</h2>
							<p>{partnerHere ? `${to.name} is here, it's landing now.` : `${to.name} will find it when they come in.`}</p>
							<div className="gb-done-actions">
								<a className="btn paper" href="#/">
									Back home
								</a>
								<button className="btn blush" onClick={again}>
									Leave another
								</button>
							</div>
						</div>
					) : (
						<GiftScene
							gift={gift}
							note={showNote ? { paper: shown.paper, from: room.you, to: to.name } : null}
							phase={phase}
							env={env}
							lid={lid}
							tieKey={step === "tie" || phase === "gather" || phase === "fly" ? 1 : 0}
						/>
					)}
				</div>
			</div>

			<section className="card gb-panel" aria-label="Your note and gift" inert={!!step || undefined}>
				<header className="gb-head">
					<h1>Leave {to.name} a note</h1>
					<p className="hint">Write a note, arrange a bouquet, fill a box of chocolates. Add any of them, or all three.</p>
				</header>
				<div className="gb-tabs" role="tablist" aria-label="What's in it">
					{TABS.map((t) => {
						const on = t === "note" ? !!text : t === "flowers" ? !!b?.stems.length : !!c?.pieces.some(Boolean);
						return (
							<button key={t} role="tab" id={`gb-tab-${t}`} aria-selected={tab === t} aria-controls="gb-panel" className="gb-tab" onClick={() => pick(t)}>
								{t === "note" ? "Note" : t === "flowers" ? "Flowers" : "Chocolates"}
								{on && <Check aria-label="(added)" weight="bold" className="gb-tick" />}
							</button>
						);
					})}
				</div>
				<div id="gb-panel" role="tabpanel" aria-labelledby={`gb-tab-${tab}`} className="gb-tabpanel" key={tab} style={{ "--dir": dir } as CSSProperties}>
					{tab === "note" && (
						<>
							<div className="lt-paper lt-writing gb-note" data-paper={draft.paper}>
								<p className="lt-for">For {to.name}</p>
								<textarea
									className="lt-text"
									value={draft.text}
									maxLength={LIMITS.letter}
									aria-label={`Your note for ${to.name}`}
									placeholder={`Write something for ${to.name}…`}
									onChange={(e) => put({ text: e.target.value })}
								/>
								<p className="lt-sign">{me.name}</p>
							</div>
							<div className="gb-row gb-inline">
								<fieldset className="lt-papers">
									<legend className="sr-only">Paper</legend>
									{PAPERS.map((p) => (
										<label key={p} className="lt-swatch" data-paper={p} title={PAPER_NAMES[p]}>
											<input type="radio" name="gb-paper" value={p} checked={draft.paper === p} onChange={() => put({ paper: p })} />
											<span className="sr-only">{PAPER_NAMES[p]}</span>
										</label>
									))}
								</fieldset>
								<span className="gb-count">{draft.text.length > LIMITS.letter - 100 ? `${LIMITS.letter - draft.text.length} left` : gift ? "The note is optional with a gift" : ""}</span>
							</div>
						</>
					)}

					{tab === "flowers" &&
						(!b ? (
							<Start text="Arrange a bouquet: pick the flowers and their colours, the paper and the ribbon." action="Add flowers" onClick={() => put({ bouquet: starterBouquet() })} />
						) : (
							<>
								<section className="gb-row">
									<h2>
										Pick flowers{" "}
										<small>
											{b.stems.length} of {MAX_STEMS}
										</small>
									</h2>
									<div className="gb-flowers">
										{FLOWER_IDS.map((f) => (
											<div key={f} className="gb-flower">
												<button className="gb-add" onClick={() => addStem(f)} disabled={b.stems.length >= MAX_STEMS} aria-label={`Add a ${COLOR_NAMES[colors[f]] ?? ""} ${FLOWER_NAMES[f].toLowerCase()}`}>
													<FlowerHead f={f} c={colors[f]} size="3em" />
													<span>{FLOWER_NAMES[f]}</span>
													<Plus aria-hidden className="gb-plus" weight="bold" />
												</button>
												{FLOWERS[f].length > 1 ? (
													<div className="gb-dots" role="radiogroup" aria-label={`${FLOWER_NAMES[f]} colour`}>
														{FLOWERS[f].map((col) => (
															<button
																key={col}
																role="radio"
																aria-checked={colors[f] === col}
																aria-label={COLOR_NAMES[col]}
																title={COLOR_NAMES[col]}
																className="gb-dot"
																style={{ background: col }}
																onClick={() => setColors({ ...colors, [f]: col })}
															/>
														))}
													</div>
												) : (
													<span className="gb-dots" />
												)}
											</div>
										))}
									</div>
								</section>
								<section className="gb-row">
									<h2>In your bouquet</h2>
									{b.stems.length ? (
										<ul className="gb-stems">
											{b.stems.map((s, i) => (
												<li key={i} className={leaving.has(i) ? "gb-going" : fresh.has(i) ? "gb-new" : undefined}>
													<button onClick={() => removeStem(i)} aria-label={`Take out the ${COLOR_NAMES[s.c] ?? ""} ${FLOWER_NAMES[s.f].toLowerCase()}`} title="Take it out">
														<FlowerHead f={s.f} c={s.c} size="1.9em" />
														<X aria-hidden className="gb-x" weight="bold" />
													</button>
												</li>
											))}
										</ul>
									) : (
										<p className="hint">Tap a flower above to add it.</p>
									)}
									<div className="gb-actions">
										<button className="btn ghost sm" onClick={() => setB({ seed: newSeed() })} disabled={b.stems.length < 2}>
											<Shuffle aria-hidden />
											Rearrange
										</button>
									</div>
								</section>
								<section className="gb-row">
									<h2>Paper</h2>
									<Pills label="Paper" name="gb-wrap" options={WRAPS.map((w) => [w, WRAP_NAMES[w]])} value={b.wrap} onPick={(w) => setB({ wrap: w as Bouquet["wrap"] })} />
									{b.wrap === "tissue" && <Swatches small label="Tissue colour" name="gb-wrapc" options={TISSUES} value={b.wrapColor} onPick={(v) => setB({ wrapColor: v })} />}
								</section>
								<section className="gb-row">
									<h2>Ribbon</h2>
									<Swatches small label="Ribbon" name="gb-ribbon" options={RIBBONS} value={b.ribbon} onPick={(v) => setB({ ribbon: v })} />
								</section>
								<button className="gb-drop" onClick={() => put({ bouquet: null })}>
									No flowers this time
								</button>
							</>
						))}

					{tab === "chocolates" &&
						(!c ? (
							<Start text="Fill a box of chocolates: pick the box, then each chocolate's shape, flavour and topping." action="Add chocolates" onClick={() => put({ chocolates: starterBox() })} />
						) : (
							<>
								<section className="gb-row">
									<h2>The box</h2>
									<div className="gb-inline">
										<Pills label="Box shape" name="gb-box" options={[["heart", "Heart"], ["square", "Square"]]} value={c.box} onPick={(v) => setC({ box: v as Chocolates["box"] })} />
										<Pills label="How many" name="gb-size" options={BOX_SIZES.map((n) => [String(n), `${n}`])} value={String(c.size)} onPick={(v) => resize(Number(v) as Chocolates["size"])} />
									</div>
									<p className="gb-sub">Box</p>
									<Swatches small label="Box colour" name="gb-boxc" options={BOX_COLORS} value={c.boxColor} onPick={(v) => setC({ boxColor: v })} />
									<p className="gb-sub">Ribbon</p>
									<Swatches small label="Box ribbon" name="gb-boxr" options={RIBBONS} value={c.ribbon} onPick={(v) => setC({ ribbon: v })} />
								</section>
								<section className="gb-row">
									<h2>Your chocolate</h2>
									<div className="gb-brush">
										<svg className="gb-brush-art" viewBox="-24 -24 48 48" aria-hidden="true" key={`${brush.shape}${brush.flavor}${brush.top}`}>
											<Piece p={brush} r={19} />
										</svg>
										<div className="gb-brush-pick">
											<Pills label="Shape" name="gb-shape" options={SHAPES.map((s) => [s, SHAPE_NAMES[s]])} value={brush.shape} onPick={(v) => setBrush({ ...brush, shape: v as Choc["shape"] })} />
											<Swatches small label="Flavour" name="gb-flavor" options={FLAVORS.map((f): Swatch => [f, FLAVOR_NAMES[f], FLAVOR_FILL[f]])} value={brush.flavor} onPick={(v) => setBrush({ ...brush, flavor: v as Choc["flavor"] })} />
											<Pills label="Topping" name="gb-top" options={TOPS.map((t) => [t, TOP_NAMES[t]])} value={brush.top} onPick={(v) => setBrush({ ...brush, top: v as Choc["top"] })} />
										</div>
									</div>
								</section>
								<section className="gb-row">
									<h2>
										Fill the box <small>tap a spot to put it there, tap again to take it out</small>
									</h2>
									<div className="gb-box-edit" style={{ width: `min(100%, ${Math.round((boxLayout(c.size, c.box).w + 30) * 1.7)}px)` }}>
										<div className="gb-morph" key={`${c.size}${c.box}`}>
											<ChocolateBox
												c={c}
												anim={boxAnim}
												onCell={place}
												cellLabel={(i) => (c.pieces[i] ? `Spot ${i + 1}: ${FLAVOR_NAMES[c.pieces[i]!.flavor].toLowerCase()} ${SHAPE_NAMES[c.pieces[i]!.shape].toLowerCase()}` : `Spot ${i + 1}: empty`)}
											/>
										</div>
									</div>
									<div className="gb-actions">
										<button className="btn ghost sm" onClick={fillEmpty} disabled={c.pieces.every(Boolean)}>
											Fill the empty spots
										</button>
										<button className="btn ghost sm" onClick={mix}>
											<Shuffle aria-hidden />
											Mix it up
										</button>
										<button className="btn ghost sm" onClick={() => setC({ pieces: c.pieces.map(() => null) })} disabled={!c.pieces.some(Boolean)}>
											Empty the box
										</button>
									</div>
								</section>
								<button className="gb-drop" onClick={() => put({ chocolates: null })}>
									No chocolates this time
								</button>
							</>
						))}
				</div>

				<footer className="gb-foot">
					<a className="btn ghost gb-back" href="#/">
						<ArrowLeft aria-hidden />
						Not now
					</a>
					<button className="btn blush" onClick={sendIt} disabled={!canSend || !!step}>
						{giftOf(draft) ? <Gift aria-hidden /> : <PaperPlaneTilt aria-hidden />}
						{giftOf(draft) ? "Wrap & send" : "Seal & send"}
					</button>
				</footer>
			</section>
		</main>
	);
}

function Start({ text, action, onClick }: { text: string; action: string; onClick: () => void }): ReactNode {
	return (
		<div className="gb-start">
			<p>{text}</p>
			<button className="btn blush" onClick={onClick}>
				<Plus aria-hidden />
				{action}
			</button>
		</div>
	);
}
