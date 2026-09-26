import { useId, useState, type FormEvent } from "react";
import { LIMITS, other, type Who } from "../shared/types";
import { profileOf, send, useRoom } from "./room";
import Teddy, { type Mood } from "./Teddy";
import "./home.css";

// ---------- Login: passcode on a love-ticket, with a teddy that hides its eyes while you type ----------

export function Login({ onIn }: { onIn: (who: Who) => void }) {
	const [passcode, setPasscode] = useState("");
	const [focused, setFocused] = useState(false);
	const [show, setShow] = useState(false);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [shake, setShake] = useState(false);

	async function submit(e: FormEvent) {
		e.preventDefault();
		if (!passcode || busy) return;
		setBusy(true);
		setError(null);
		try {
			const r = await fetch("/api/login", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ passcode }),
			});
			if (r.ok) return onIn(((await r.json()) as { who: Who }).who);
			setError(
				r.status === 401
					? "Hmm, that's not it 🥺"
					: r.status === 429
						? "Too many tries. Take a little break and try again in a few minutes 🧸"
						: "The theater didn't answer. Try again in a moment.",
			);
			setShake(true);
		} catch {
			setError("Couldn't reach the theater. Check your internet and try again.");
		} finally {
			setBusy(false);
		}
	}

	const mood: Mood = error ? "sad" : focused || passcode ? "cover" : "peek";

	return (
		<main className="center-screen login">
			<div className="login-wrap">
				<h1 className="login-marquee">
					<span>Our Little</span> <span>Theater</span>
				</h1>
				<div className="login-bear">
					<Teddy mood={mood} size={190} className={show && mood === "cover" ? "login-teddy teddy-peeking" : "login-teddy"} />
				</div>
				<form
					className={shake ? "love-ticket login-ticket shake" : "love-ticket login-ticket"}
					onSubmit={submit}
					onAnimationEnd={(e) => e.target === e.currentTarget && setShake(false)}
				>
					<label htmlFor="passcode" className="login-label">
						Your passcode
					</label>
					<div className="pass-field">
						<input
							id="passcode"
							name="password"
							className="input"
							type={show ? "text" : "password"}
							autoComplete="current-password"
							autoCapitalize="none"
							spellCheck={false}
							maxLength={200}
							value={passcode}
							onChange={(e) => {
								setPasscode(e.target.value);
								setError(null);
							}}
							onFocus={() => setFocused(true)}
							onBlur={() => setFocused(false)}
							aria-invalid={error ? true : undefined}
							aria-describedby={error ? "login-error" : undefined}
						/>
						<button type="button" className="pass-toggle" onClick={() => setShow(!show)} aria-label={show ? "Hide passcode" : "Show passcode"}>
							{show ? "Hide" : "Show"}
						</button>
					</div>
					<button className="btn login-go" disabled={busy || !passcode}>
						{busy ? "Checking…" : "Let me in"}
					</button>
					<p id="login-error" className="login-error" role="alert">
						{error}
					</p>
				</form>
				<p className="muted login-foot">Just for the two of us 💗</p>
			</div>
		</main>
	);
}

// ---------- Name your love: you pick your partner's name and their teddy's bow ----------

const SWATCHES = [
	{ name: "Bubblegum", hex: "#fb6f92" },
	{ name: "Peach", hex: "#ff9a6b" },
	{ name: "Butter", hex: "#ffc94d" },
	{ name: "Mint", hex: "#5ccfa4" },
	{ name: "Sky", hex: "#72b6ff" },
	{ name: "Lilac", hex: "#b48cff" },
];

/** The form behind first login and "rename". Saves as the partner's profile (the Room stores it under other(you)). */
export function NameYourLove({ onDone }: { onDone?: () => void }) {
	const room = useRoom();
	const partner = room ? other(room.you) : "b";
	const current = room?.profiles[partner];
	const [name, setName] = useState(current?.name ?? "");
	const [color, setColor] = useState(current?.color ?? (partner === "a" ? SWATCHES[0].hex : SWATCHES[5].hex));
	const [saving, setSaving] = useState(false);
	const id = useId();
	const trimmed = name.trim();

	function submit(e: FormEvent) {
		e.preventDefault();
		if (!trimmed) return;
		send({ t: "profile", profile: { name: trimmed, color } });
		if (onDone) onDone();
		else setSaving(true); // first login: the app moves on once the Room echoes the profile back
	}

	return (
		<form className="love-ticket love-card" onSubmit={submit}>
			<div className="love-preview">
				<Teddy mood={trimmed ? "love" : "think"} size={150} accent={color} />
				<span className={trimmed ? "nametag" : "nametag empty"}>{trimmed || "…"}</span>
			</div>
			<h1 id={`${id}-title`}>What do you call your love? 💗</h1>
			<p className="muted love-help">They'll see this name under their teddy.</p>
			<input
				className="input love-input"
				aria-labelledby={`${id}-title`}
				placeholder="A name or a nickname"
				autoComplete="off"
				maxLength={LIMITS.name}
				value={name}
				onChange={(e) => setName(e.target.value)}
			/>
			<fieldset className="swatches">
				<legend>Their teddy's bow</legend>
				<div className="swatch-row">
					{SWATCHES.map((s) => (
						<label key={s.hex} className="swatch" title={s.name}>
							<input type="radio" className="sr-only" name={`${id}-bow`} value={s.hex} checked={color === s.hex} onChange={() => setColor(s.hex)} />
							<span className="swatch-dot" style={{ background: s.hex }} />
							<span className="sr-only">{s.name}</span>
						</label>
					))}
				</div>
			</fieldset>
			<button className="btn love-save" disabled={!trimmed || saving}>
				{saving ? "Saving…" : "Save 💗"}
			</button>
		</form>
	);
}

export function ProfilePicker() {
	return (
		<main className="center-screen love-page">
			<NameYourLove />
		</main>
	);
}

// ---------- Door: the lobby before the call starts ----------

export function Door({ onEnter }: { onEnter: () => void }) {
	const room = useRoom();
	if (!room) return null;
	const partnerWho = other(room.you);
	const me = profileOf(room, room.you);
	const partner = profileOf(room, partnerWho);
	const inside = room.online.some((p) => p.who === partnerWho);

	return (
		<main className="center-screen door">
			<div className="door-wrap">
				<h1 className="door-title">{room.profiles[room.you] ? `Hi ${me.name}!` : "Hi there!"}</h1>
				<div className="velvet velvet--closed">
					<i className="velvet-curtain velvet-curtain-l" aria-hidden="true" />
					<i className="velvet-curtain velvet-curtain-r" aria-hidden="true" />
					<div className="velvet-duo">
						<div className="velvet-bear">
							<Teddy mood="idle" size={160} accent={me.color} label="Your teddy" />
						</div>
						{inside && (
							<div className="velvet-bear">
								<Teddy mood="wave" size={160} accent={partner.color} label={`${partner.name}'s teddy, waving at you`} />
							</div>
						)}
					</div>
					<div className="velvet-floor" />
				</div>
				<p className="door-status">{inside ? `${partner.name} is waiting inside 💗` : `${partner.name} isn't here yet. You get first pick of the snacks 🍿`}</p>
				<button className="btn door-go" onClick={onEnter}>
					Come in 🚪
				</button>
				<p className="muted door-note">Next, your browser asks to use your camera and mic so you can see each other. It's fine to say no.</p>
			</div>
		</main>
	);
}
