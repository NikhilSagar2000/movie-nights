import { useEffect, useRef, useState } from "react";
import { other, type Who } from "../shared/types";
import { logout, type Route } from "./main";
import { profileOf, useRoom } from "./room";
import { useCall } from "./rtc";
import Teddy, { type Mood } from "./Teddy";
import { NameYourLove } from "./Login";
import "./home.css";

const HEART = "M0 7C-10 0-10-8-5-8C-2-8 0-6 0-4C0-6 2-8 5-8C10-8 10 0 0 7Z";

const DOING: Partial<Record<Mood, string>> = { love: "hugging", wave: "waving", sleep: "asleep" };

const LINKS = [
	{ route: "", label: "Home", icon: "🏠" },
	{ route: "theater", label: "Theater", icon: "🎬" },
	{ route: "games", label: "Games", icon: "🎮" },
	{ route: "memories", label: "Memories", icon: "🎟️" },
] as const;

const TILES = [
	{ href: "#/theater", title: "Theater 🎬", text: "Share a movie and see each other while you watch.", mood: "popcorn", cls: "tile-theater" },
	{ href: "#/games", title: "Games 🎮", text: "Six little games for two.", mood: "cheer", cls: "tile-games" },
	{ href: "#/memories", title: "Memories 🎟️", text: "The movie jar and your love-ticket stubs.", mood: "love", cls: "tile-memories" },
] as const;

export function Nav({ route }: { route: Route }) {
	const room = useRoom();
	if (!room) return null;
	const partnerWho = other(room.you);
	const partner = profileOf(room, partnerWho);
	const online = room.online.some((p) => p.who === partnerWho);
	const presence = `${partner.name} is ${online ? "here" : "away"}`;

	return (
		<header className="nav">
			<span className="nav-brand">
				<span className="nav-mark">
					<Teddy size={44} />
				</span>
				<span className="nav-name">Our Little Theater</span>
			</span>
			<nav className="nav-links" aria-label="Main">
				{LINKS.map((l) => (
					<a key={l.route} href={`#/${l.route}`} className="nav-link" aria-current={route === l.route ? "page" : undefined}>
						<span aria-hidden="true">{l.icon}</span>
						<span className="nav-label">{l.label}</span>
					</a>
				))}
			</nav>
			<span className={online ? "nav-presence on" : "nav-presence"} title={presence}>
				<span className="nav-dot" aria-hidden="true" />
				<span className="nav-pname" aria-hidden="true">
					{partner.name}
				</span>
				<span className="sr-only">{presence}</span>
			</span>
			<button className="btn ghost icon nav-out" onClick={() => void logout()} aria-label="Log out" title="Log out">
				<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
					<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
				</svg>
			</button>
		</header>
	);
}

function RenameDialog({ onClose }: { onClose: () => void }) {
	const ref = useRef<HTMLDialogElement>(null);
	useEffect(() => {
		if (!ref.current?.open) ref.current?.showModal();
	}, []);
	const close = () => ref.current?.close();
	return (
		<dialog ref={ref} className="rename-dialog" aria-label="Rename your love" onClose={onClose} onClick={(e) => e.target === e.currentTarget && close()}>
			<NameYourLove onDone={close} />
			<button className="btn ghost icon rename-x" onClick={close} aria-label="Close">
				✕
			</button>
		</dialog>
	);
}

export function Home() {
	const room = useRoom();
	const call = useCall();
	const [renaming, setRenaming] = useState(false);
	if (!room) return null;

	const partnerWho = other(room.you);
	const me = profileOf(room, room.you); // what your partner calls you, and the bow they picked for you
	const partner = profileOf(room, partnerWho);
	const isOn = (w: Who) => room.online.some((p) => p.who === w);
	const both = isOn(room.you) && isOn(partnerWho);
	const moodOf = (w: Who): Mood => (both ? "love" : isOn(w) ? "wave" : "sleep");

	return (
		<main className="page home">
			<section className="velvet home-stage" aria-labelledby="home-greeting">
				<i className="velvet-curtain velvet-curtain-l" aria-hidden="true" />
				<i className="velvet-curtain velvet-curtain-r" aria-hidden="true" />
				<div className="home-greeting">
					<h1 id="home-greeting">{isOn(partnerWho) ? `${partner.name} is here!` : "Movie night? 🍿"}</h1>
					<p>
						{isOn(partnerWho)
							? "Your teddies found each other. Pick a movie or a game."
							: `${partner.name} is asleep right now. Their teddy wakes up when they come in.`}
						{call.connection === "connected" && (
							<span className="chip together-chip" title="Your video call is connected">
								together 💞
							</span>
						)}
					</p>
				</div>
				<div className={both ? "velvet-duo together" : "velvet-duo"}>
					<div className="velvet-bear velvet-bear--left">
						<Teddy mood={moodOf(room.you)} size={210} accent={me.color} label={`Your teddy, ${DOING[moodOf(room.you)]}`} />
					</div>
					<div className="velvet-bear velvet-bear--right">
						<Teddy mood={moodOf(partnerWho)} size={210} accent={partner.color} label={`${partner.name}'s teddy, ${DOING[moodOf(partnerWho)]}`} />
					</div>
					{both && (
						<div className="hug-hearts" aria-hidden="true">
							{[0, 1, 2].map((i) => (
								<svg key={i} viewBox="-10 -10 20 20" style={{ animationDelay: `${-i * 0.9}s` }}>
									<path d={HEART} />
								</svg>
							))}
						</div>
					)}
				</div>
				<div className="velvet-floor">
					<div className="placards">
						<p className="placard">
							{room.profiles[room.you] ? (
								<>
									{partner.name} calls you <b>“{me.name}”</b> 💕
								</>
							) : (
								`${partner.name} hasn't named you yet 🥺`
							)}
						</p>
						<p className="placard">
							<b>{partner.name}</b>
							<button className="rename" onClick={() => setRenaming(true)} aria-label={`Rename ${partner.name}`}>
								✏️ rename
							</button>
						</p>
					</div>
				</div>
			</section>

			<div className="tiles">
				{TILES.map((t, i) => (
					<a key={t.href} href={t.href} className={`tile ${t.cls}`}>
						<Teddy mood={t.mood} size={116} accent={i === 1 ? partner.color : me.color} />
						<div className="tile-text">
							<h2>{t.title}</h2>
							<p>{t.text}</p>
						</div>
					</a>
				))}
			</div>

			{renaming && <RenameDialog onClose={() => setRenaming(false)} />}
		</main>
	);
}
