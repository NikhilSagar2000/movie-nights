import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { other, type Who } from "../shared/types";
import { connect, useRoom } from "./room";
import { startCall, useCall } from "./rtc";
import { Head, Loader } from "./Character";
import { Door, Login, ProfilePicker } from "./Login";
import { Home, Nav } from "./Home";
import Theater from "./Theater";
import FaceCams from "./FaceCams";
import Games from "./Games";
import Memories from "./Memories";

export type Route = "" | "theater" | "games" | "memories";

function useRoute(): Route {
	const read = () => location.hash.replace(/^#\/?/, "").split("/")[0] as Route; // "#/games/snake" is the games page
	const [route, setRoute] = useState(read);
	useEffect(() => {
		const onHash = () => setRoute(read());
		addEventListener("hashchange", onHash);
		return () => removeEventListener("hashchange", onHash);
	}, []);
	return route;
}

function Splash({ text }: { text: string }) {
	return (
		<main className="center-screen">
			<Loader text={text} />
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

	if (auth === "checking") return <Splash text="Warming up the popcorn" />;
	if (auth === "out") return <Login onIn={setAuth} />;
	if (!room) return <Splash text="Opening the theater" />;
	if (room.replaced)
		return (
			<main className="center-screen hm-login">
				<i className="clouds" />
				<div className="hm-login-col">
					<div className="hm-peek">
						<Head who="b" mood="bob" />
						<Head who="a" mood="bob" />
					</div>
					<div className="card hm-login-card hm-replaced">
						<h1 className="hm-replaced-title">You opened the theater in another tab</h1>
						<p className="hint">Only one tab can be in the room at a time.</p>
						<button className="btn hm-go" onClick={() => location.reload()}>
							Use this tab instead
						</button>
					</div>
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
