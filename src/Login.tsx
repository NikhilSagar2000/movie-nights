import { useId, useState, type CSSProperties, type FormEvent } from "react";
import { Check, DoorOpen, Eye, EyeSlash, HourglassMedium, WarningCircle } from "@phosphor-icons/react";
import { LIMITS, other, type Who } from "../shared/types";
import { profileOf, RINGS, ringOf, send, useRoom } from "./room";
import { Head } from "./Character";
import "./home.css";

// ---------- Login: a cream card the two of you peek over, and duck behind while the passcode is typed ----------

const TOO_MANY = "Too many tries. Take a little break and try again in a few minutes.";

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
					? "That is not our passcode. Try again?"
					: r.status === 429
						? TOO_MANY
						: "Window Seat didn't answer. Try again in a moment.",
			);
			setShake(true);
		} catch {
			setError("Couldn't reach Window Seat. Check your internet and try again.");
		} finally {
			setBusy(false);
		}
	}

	// they duck while you type, and pop back up to see what went wrong
	const duck = (focused || !!passcode) && !error;
	const mood = error === TOO_MANY ? "drowsy" : "idle";
	const ErrIcon = error === TOO_MANY ? HourglassMedium : WarningCircle;

	return (
		<main className="center-screen hm-login">
			<i className="moon hm-login-moon" />
			<i className="clouds" />
			<div className="hm-login-col">
				<h1 className="hm-wordmark">
					<img className="mark" src="/favicon.svg" alt="" />
					Window Seat
				</h1>
				<div className={`hm-peek${duck ? " duck" : ""}${duck && show ? " show" : ""}`}>
					<Head who="b" mood={mood} />
					<Head who="a" mood={mood} />
				</div>
				<form
					className={shake ? "card hm-login-card shake" : "card hm-login-card"}
					onSubmit={submit}
					onAnimationEnd={(e) => e.target === e.currentTarget && setShake(false)}
				>
					<label htmlFor="passcode" className="label">
						Your passcode
					</label>
					<div className="hm-pass">
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
						<button type="button" className="hm-eye" onClick={() => setShow(!show)} aria-label={show ? "Hide passcode" : "Show passcode"}>
							{show ? <EyeSlash aria-hidden /> : <Eye aria-hidden />}
						</button>
					</div>
					<p id="login-error" className="err hm-login-err" role="alert">
						{error && (
							<>
								<ErrIcon aria-hidden weight="bold" />
								{error}
							</>
						)}
					</p>
					<button className="btn hm-go" disabled={busy || !passcode}>
						{busy ? "Checking…" : "Let me in"}
					</button>
					<p className="hint hm-login-hint">Just for the two of us</p>
				</form>
			</div>
		</main>
	);
}

// ---------- Name your love: you pick your partner's name and the color that rings their face ----------

/** The form behind first login and "rename". Saves as the partner's profile (the Room stores it under other(you)). */
export function NameYourLove({ onDone }: { onDone?: () => void }) {
	const room = useRoom();
	const partner = room ? other(room.you) : "b";
	const current = room?.profiles[partner];
	const [name, setName] = useState(current?.name ?? "");
	const [color, setColor] = useState(ringOf(partner, current?.color));
	const [saving, setSaving] = useState(false);
	const [picked, setPicked] = useState(0); // replays a little hop in the portrait on every color pick
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
		<form className="card hm-love" onSubmit={submit}>
			<div className="arch hm-portrait" style={{ "--ring": color } as CSSProperties}>
				<Head who={partner} twinkle moment={picked ? "happy" : null} nonce={picked} />
			</div>
			<div className="hm-love-form">
				<h1 className="hm-love-title">What do you call your love?</h1>
				<label className="label" htmlFor={`${id}-name`}>
					Their name
				</label>
				<input
					id={`${id}-name`}
					className="input love-input"
					placeholder="A name or a nickname"
					autoComplete="off"
					maxLength={LIMITS.name}
					value={name}
					onChange={(e) => setName(e.target.value)}
				/>
				<fieldset className="hm-swatches">
					<legend className="label">Their color</legend>
					<div className="hm-swatch-row">
						{RINGS.map((r) => (
							<label key={r.hex} className="hm-swatch" title={r.name}>
								<input
									type="radio"
									className="sr-only"
									name={`${id}-ring`}
									value={r.hex}
									checked={color === r.hex}
									onChange={() => {
										setColor(r.hex);
										setPicked((n) => n + 1);
									}}
								/>
								<span className="hm-swatch-dot" style={{ background: r.hex }}>
									{color === r.hex && <Check aria-hidden weight="bold" />}
								</span>
								<span className="sr-only">{r.name}</span>
							</label>
						))}
					</div>
				</fieldset>
				<p className="hint">It rings their face cam and their name tag.</p>
				<button className="btn love-save" disabled={!trimmed || saving}>
					{saving ? "Saving…" : "Save"}
				</button>
			</div>
		</form>
	);
}

export function ProfilePicker() {
	return (
		<main className="center-screen hm-love-page">
			<i className="clouds hm-haze-clouds" />
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
		<main className="center-screen hm-door-page">
			<i className="moon hm-door-moon" />
			<div className="hm-door-scene">
				<div className="hm-door-copy">
					<h1>{room.profiles[room.you] ? `Hi ${me.name}` : "Hi there"}</h1>
					<p className="hm-door-status">{inside ? `${partner.name} is waiting inside` : `${partner.name} is not here yet`}</p>
					<button className="btn" onClick={onEnter}>
						<DoorOpen aria-hidden />
						Come in
					</button>
					<p className="hm-door-note">Next, your browser asks to use your camera and mic so you can see each other. It is fine to say no.</p>
				</div>
				<div className={inside ? "arch hm-door open" : "arch hm-door"}>
					{inside && <Head who={partnerWho} mood="bob" twinkle className="hm-door-head" />}
					<i className="hm-leaf" />
					<i className="hm-knob" />
				</div>
			</div>
			<i className="clouds" />
		</main>
	);
}
