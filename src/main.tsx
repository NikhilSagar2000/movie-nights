import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { other, type Who } from "../shared/types";
import { connect, useRoom } from "./room";
import { startCall, useCall } from "./rtc";
import Teddy from "./Teddy";
import { Door, Login, ProfilePicker } from "./Login";
import { Home, Nav } from "./Home";
import Theater from "./Theater";
import FaceCams from "./FaceCams";
import Games from "./Games";
import Memories from "./Memories";

export type Route = "" | "theater" | "games" | "memories";

function useRoute(): Route {
	const read = () => location.hash.replace(/^#\/?/, "") as Route;
	const [route, setRoute] = useState(read);
	useEffect(() => {
		const onHash = () => setRoute(read());
		addEventListener("hashchange", onHash);
		return () => removeEventListener("hashchange", onHash);
	}, []);
	return route;
}

export async function logout() {
	await fetch("/api/logout", { method: "POST" }).catch(() => {});
	location.hash = "";
	location.reload();
}

function Splash({ text }: { text: string }) {
	return (
		<main className="center-screen">
			<div>
				<Teddy mood="sleep" size={140} />
				<p className="muted">{text}</p>
			</div>
		</main>
	);
}

function App() {
	const [auth, setAuth] = useState<"checking" | "out" | Who>("checking");
	const room = useRoom();
	const call = useCall();
	const route = useRoute();

	useEffect(() => {
		fetch("/api/me")
			.then((r) => (r.ok ? r.json() : null))
			.then((d: { who?: Who } | null) => setAuth(d?.who ?? "out"))
			.catch(() => setAuth("out"));
	}, []);

	useEffect(() => {
		if (auth !== "checking" && auth !== "out") connect(() => setAuth("out"));
	}, [auth]);

	if (auth === "checking") return <Splash text="Warming up the popcorn…" />;
	if (auth === "out") return <Login onIn={setAuth} />;
	if (!room) return <Splash text="Opening the theater doors…" />;
	if (room.replaced)
		return (
			<main className="center-screen">
				<div>
					<Teddy mood="peek" size={140} />
					<h2>You opened the theater in another tab 💕</h2>
					<button className="btn" onClick={() => location.reload()}>
						Use this tab instead
					</button>
				</div>
			</main>
		);
	if (!room.profiles[other(room.you)]) return <ProfilePicker />; // you name your love before coming in
	if (!call.started) return <Door onEnter={() => void startCall(room.you)} />;

	return (
		<>
			<Nav route={route} />
			{route === "theater" ? <Theater /> : route === "games" ? <Games /> : route === "memories" ? <Memories /> : <Home />}
			<FaceCams />
		</>
	);
}

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<App />
	</StrictMode>,
);
