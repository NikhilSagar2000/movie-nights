import { useEffect, useRef, useState } from "react";
import { ArrowRight, FilmSlate, GameController, Heart, House, SignOut, Ticket, X } from "@phosphor-icons/react";
import { other, type Who } from "../shared/types";
import type { Route } from "./main";
import { logout, onRelay, profileOf, relay, useRoom } from "./room";
import { useCall } from "./rtc";
import { Duo, Face, Flower, lateNight, type HeadProps, type Moment } from "./Character";
import { NameYourLove } from "./Login";
import "./home.css";

const LINKS = [
	{ route: "", label: "Home", Icon: House },
	{ route: "theater", label: "Theater", Icon: FilmSlate },
	{ route: "games", label: "Games", Icon: GameController },
	{ route: "memories", label: "Memories", Icon: Ticket },
] as const;

const ROWS = [
	{ href: "#/theater", title: "Theater", text: "Share a tab and see each other", Icon: FilmSlate, go: true },
	{ href: "#/games", title: "Games", text: "Six little games, nobody keeps score", Icon: GameController, go: false },
	{ href: "#/memories", title: "Memories", text: "The movie jar and your ticket stubs", Icon: Ticket, go: false },
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
			<span className="hm-brand">
				<Flower />
				<span className="hm-brand-name">Our Little Theater</span>
			</span>
			<nav className="hm-links" aria-label="Main">
				{LINKS.map(({ route: r, label, Icon }) => (
					<a key={r} href={`#/${r}`} className="hm-link" aria-current={route === r ? "page" : undefined}>
						<Icon aria-hidden weight={route === r ? "fill" : "regular"} />
						<span className="hm-link-label">{label}</span>
					</a>
				))}
			</nav>
			<span className="hm-who" title={presence}>
				<Face who={partnerWho} ring={partner.color} s="2em" mood={online ? "still" : "away"} />
				<span className="hm-who-name" aria-hidden="true">
					{partner.name}
				</span>
				<span className={online ? "on-dot" : "on-dot off"} aria-hidden="true" />
				<span className="sr-only">{presence}</span>
			</span>
			<button className="btn icon sm hm-out" onClick={() => void logout()} aria-label="Log out" title="Log out">
				<SignOut aria-hidden />
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
		<dialog ref={ref} className="hm-rename-dialog" aria-label="Rename your love" onClose={onClose} onClick={(e) => e.target === e.currentTarget && close()}>
			<NameYourLove onDone={close} />
			<button className="btn ghost icon sm hm-rename-x" onClick={close} aria-label="Close">
				<X aria-hidden />
			</button>
		</dialog>
	);
}

type Play = { m: Moment | null; n: number };
const side = (w: Who) => (w === "b" ? "l" : "r"); // the Duo draws her (b) on the left, him (a) on the right

export function Home() {
	const room = useRoom();
	const call = useCall();
	const [renaming, setRenaming] = useState(false);
	// one-shot moments on each head: theirs arrives or gets booped, yours gets booped back
	const [them, setThem] = useState<Play>({ m: null, n: 0 });
	const [mine, setMine] = useState<Play>({ m: null, n: 0 });
	const lastBoop = useRef(0);
	const wasOn = useRef<boolean | null>(null);
	const partnerOn = !!room && room.online.some((p) => p.who === other(room.you));

	// their head pops up when they come online (not on first render)
	useEffect(() => {
		if (wasOn.current === false && partnerOn) setThem((p) => ({ m: "arrive", n: p.n + 1 }));
		wasOn.current = partnerOn;
	}, [partnerOn]);

	// a boop from them squishes your head
	useEffect(
		() =>
			onRelay((_, d) => {
				if (d.k === "nudge" && d.kind === "boop") setMine((p) => ({ m: "squish", n: p.n + 1 }));
			}),
		[],
	);

	if (!room) return null;

	const partnerWho = other(room.you);
	const me = profileOf(room, room.you); // what your partner calls you
	const partner = profileOf(room, partnerWho);
	const isOn = (w: Who) => room.online.some((p) => p.who === w);
	const both = isOn(room.you) && partnerOn;
	const idle = lateNight() ? "drowsy" : "idle";

	function boop() {
		const now = Date.now();
		if (now - lastBoop.current < 600) return;
		lastBoop.current = now;
		setThem((p) => ({ m: "squish", n: p.n + 1 }));
		relay({ k: "nudge", kind: "boop" });
	}

	const head = (w: Who, play: Play): Partial<HeadProps> => ({ mood: isOn(w) ? idle : "away", twinkle: true, moment: play.m, nonce: play.n });
	const heads = { [room.you]: head(room.you, mine), [partnerWho]: head(partnerWho, them) } as Record<Who, Partial<HeadProps>>;
	const pop = (play: Play, w: Who) => play.m === "squish" && <Flower key={`${w}${play.n}`} className={`hm-pop ${side(w)}`} />;

	return (
		<main className="page hm-home">
			<div className="arch hm-window">
				<i className="stars" />
				<i className="moon hm-window-moon" />
				<Duo together={both} a={heads.a} b={heads.b}>
					{pop(them, partnerWho)}
					{pop(mine, room.you)}
					{partnerOn && <button className={`hm-boop ${side(partnerWho)}`} onClick={boop} aria-label={`Boop ${partner.name}`} title={`Boop ${partner.name}`} />}
				</Duo>
				<i className="clouds" />
			</div>

			<div className="hm-copy">
				{both && (
					<span className="chip sage" title={call.connection === "connected" ? "Your video call is connected" : undefined}>
						<Heart aria-hidden weight="fill" />
						Together
					</span>
				)}
				<h1>{partnerOn ? `${partner.name} is here` : `${partner.name} is not home yet`}</h1>
				<p className="hm-lede">{partnerOn ? "You are both home. Pick something to do together." : "Their head pops up in the window when they come in."}</p>

				<div className="hm-rows">
					{ROWS.map(({ href, title, text, Icon, go }) => (
						<a key={href} href={href} className={go ? "hm-row go" : "hm-row"}>
							<span className="hm-ico">
								<Icon aria-hidden />
							</span>
							<span className="hm-row-text">
								<b>{title}</b>
								<span>{text}</span>
							</span>
							<ArrowRight aria-hidden className="hm-arrow" />
						</a>
					))}
				</div>

				<p className="hint hm-names">
					{room.profiles[room.you] ? (
						<>
							{partner.name} calls you <b>{me.name}</b>.
						</>
					) : (
						`${partner.name} has not named you yet.`
					)}{" "}
					<button className="hm-rename" onClick={() => setRenaming(true)}>
						Rename {partner.name}
					</button>
				</p>
			</div>

			{renaming && <RenameDialog onClose={() => setRenaming(false)} />}
		</main>
	);
}
