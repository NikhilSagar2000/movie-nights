// Dress up (#/dress): change how your own character looks. A draft until Save; your partner sees it after that.
// The worn things are drawn by src/lookArt.tsx; the Room keeps each person's look (shared/look.ts checks it).
import { useState } from "react";
import { ArrowLeft, Check, Shuffle } from "@phosphor-icons/react";
import { other, type Who } from "../shared/types";
import { bareLook, LOOK_ITEMS, LOOK_SLOTS, ONLY, type Look, type LookSlot } from "../shared/look";
import { profileOf, saveLook, useRoom } from "./room";
import { Duo, type Mood } from "./Character";
import "./wardrobe.css";

const NAMES: Record<string, string> = {
	beanie: "Beanie",
	cat: "Cat ears",
	wreath: "Flower crown",
	halo: "Halo",
	phones: "Headphones",
	hearts: "Heart shades",
	shades: "Sunglasses",
	specs: "Round specs",
	blush: "Blush",
	freckles: "Freckles",
	stars: "Star stickers",
	stickers: "Heart stickers",
	bow: "Bow",
	flower: "Flower",
	star: "Star",
};
/** The colour each thing starts in. */
const START: Record<string, string> = {
	beanie: "#b46a72",
	cat: "hair",
	wreath: "#f4a3b4",
	halo: "#f2c95e",
	phones: "#8fb8c9",
	hearts: "#e27d93",
	shades: "#2d3a47",
	specs: "#b46a72",
	blush: "#f4a3b4",
	freckles: "#9a6a4f",
	stars: "#f7dd8d",
	stickers: "#e27d93",
	bow: "#e27d93",
	flower: "#f7dd8d",
	star: "#f2c95e",
};
const SLOT_NAMES: Record<LookSlot, string> = { head: "On your head", eyes: "Eyes", cheeks: "Cheeks", clip: "Hair clip" };
/** [value, name, what the dot shows]. "" = as drawn. */
type Swatch = [value: string, name: string, dot?: string];
const INK = "#2d3a47";
const SKINS: Swatch[] = [["", "As drawn", "#fff7e6"], ["#ffe4cf", "Peach"], ["#f3c9a4", "Sand"], ["#dba57c", "Honey"], ["#b07a55", "Caramel"], ["#7d5539", "Cocoa"]];
const HAIRS: Swatch[] = [["", "As drawn", INK], ["#17151c", "Black"], ["#5a3d31", "Chocolate"], ["#8a4b35", "Auburn"], ["#b98a45", "Honey"], ["#6b4a78", "Plum"], ["#b46a72", "Rosewood"], ["#3f5b6e", "Deep blue"]];
const COLORS: Swatch[] = [
	[INK, "Ink"],
	["#52657a", "Dusk"],
	["#8fb8c9", "Sky blue"],
	["#c3b1e1", "Lilac"],
	["#fff7e6", "Cream"],
	["#f4a3b4", "Pink"],
	["#e27d93", "Rose"],
	["#b46a72", "Rosewood"],
	["#f7dd8d", "Butter"],
	["#f2c95e", "Gold"],
	["#a8b58a", "Sage"],
	["#9a6a4f", "Cocoa"],
];
const MOODS: [Mood, string][] = [["still", "Still"], ["idle", "Breathe"], ["bob", "Bob"], ["hop", "Hop"], ["dizzy", "Dizzy"]];

const canWear = (you: Who) => (id: string) => !ONLY[id] || ONLY[id] === you;
/** Dark dots get a light tick. */
const dark = (hex: string) => {
	const n = parseInt(hex.slice(1), 16);
	return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) < 120;
};
const any = <T,>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)];

function surprise(you: Who, now: Look): Look {
	const next: Look = { ...now, hair: Math.random() < 0.4 ? null : any(HAIRS.slice(1))[0] };
	for (const slot of LOOK_SLOTS) {
		const id = any(LOOK_ITEMS[slot].filter(canWear(you)));
		next[slot] = Math.random() < 0.3 ? null : { id, c: Math.random() < 0.5 ? START[id] : any(COLORS)[0] };
	}
	if (you === "b" && next.head?.id === "phones") next.clip = null; // her headband and a clip want the same spot
	return next;
}

function Swatches({ label, name, options, value, onPick, small }: { label: string; name: string; options: Swatch[]; value: string; onPick: (v: string) => void; small?: boolean }) {
	return (
		<fieldset className={`hm-swatches${small ? " wd-small" : ""}`}>
			<legend className="sr-only">{label}</legend>
			<div className="hm-swatch-row">
				{options.map(([v, name2, dot = v]) => (
					<label key={v} className="hm-swatch" title={name2}>
						<input type="radio" className="sr-only" name={name} value={v} checked={value === v} onChange={() => onPick(v)} />
						<span className={`hm-swatch-dot${dark(dot) ? " wd-dark" : ""}`} style={{ background: dot }}>
							{value === v && <Check aria-hidden weight="bold" />}
						</span>
						<span className="sr-only">{name2}</span>
					</label>
				))}
			</div>
		</fieldset>
	);
}

function Pills({ label, name, options, value, onPick }: { label: string; name: string; options: [string, string][]; value: string; onPick: (v: string) => void }) {
	return (
		<fieldset className="wd-pills">
			<legend className="sr-only">{label}</legend>
			{options.map(([v, text]) => (
				<label key={v} className="wd-pill">
					<input type="radio" className="sr-only" name={name} value={v} checked={value === v} onChange={() => onPick(v)} />
					<span>{text}</span>
				</label>
			))}
		</fieldset>
	);
}

export default function Wardrobe() {
	const room = useRoom();
	const you = room?.you ?? "a";
	const [draft, setDraft] = useState<Look>(() => room?.looks?.[you] ?? bareLook(you));
	const [mood, setMood] = useState<Mood>("idle");
	if (!room) return null;

	const partner = profileOf(room, other(you));
	const put = (patch: Partial<Look>) => setDraft((d) => ({ ...d, ...patch }));
	const mine = { look: draft, mood, twinkle: true };
	const theirs = { mood };

	function save() {
		saveLook(draft);
		location.hash = "#/";
	}

	return (
		<main className="page wd-page">
			<div className="wd-look">
				<div className="arch wd-stage">
					<i className="stars" />
					<i className="moon wd-moon" />
					<Duo a={you === "a" ? mine : theirs} b={you === "b" ? mine : theirs} />
				</div>
				<Pills label="Try a move" name="wd-mood" options={MOODS} value={mood} onPick={(m) => setMood(m as Mood)} />
			</div>

			<div className="card wd-wardrobe">
				<header className="wd-head">
					<h1>Dress up</h1>
					<p className="hint">Only you can change how you look. {partner.name} sees it after you save.</p>
				</header>

				<section className="wd-row">
					<h2>Skin</h2>
					<Swatches label="Skin" name="wd-skin" options={SKINS} value={draft.skin ?? ""} onPick={(v) => put({ skin: v || null })} />
				</section>
				<section className="wd-row">
					<h2>Hair</h2>
					<Swatches label="Hair" name="wd-hair" options={HAIRS} value={draft.hair ?? ""} onPick={(v) => put({ hair: v || null })} />
				</section>

				{LOOK_SLOTS.map((slot) => {
					const now = draft[slot];
					const items = LOOK_ITEMS[slot].filter(canWear(you));
					const pick = (id: string) => put({ [slot]: id ? { id, c: now?.id === id ? now.c : START[id] } : null });
					return (
						<section key={slot} className="wd-row">
							<h2>
								{SLOT_NAMES[slot]}
								{slot === "clip" && you === "a" && <small>where your flower grows</small>}
							</h2>
							<Pills label={SLOT_NAMES[slot]} name={`wd-${slot}`} options={[["", "None"], ...items.map((id): [string, string] => [id, NAMES[id]])]} value={now?.id ?? ""} onPick={pick} />
							{now && (
								<Swatches
									small
									label={`${NAMES[now.id]} colour`}
									name={`wd-${slot}-c`}
									options={now.id === "cat" ? [["hair", "Same as your hair", draft.hair ?? INK], ...COLORS] : COLORS}
									value={now.c}
									onPick={(c) => put({ [slot]: { ...now, c } })}
								/>
							)}
						</section>
					);
				})}

				<div className="wd-actions">
					<button className="btn ghost sm" onClick={() => setDraft(surprise(you, draft))}>
						<Shuffle aria-hidden />
						Surprise me
					</button>
					<button className="btn ghost sm" onClick={() => setDraft(bareLook(you))}>
						Start over
					</button>
					<span className="wd-gap" />
					<a className="btn paper" href="#/">
						<ArrowLeft aria-hidden />
						Back
					</a>
					<button className="btn" onClick={save}>
						Save
					</button>
				</div>
			</div>
		</main>
	);
}
