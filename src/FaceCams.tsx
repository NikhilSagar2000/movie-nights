// Round cam bubbles floating over every page: draggable, resizable, hideable, per device.
// The partner's <video> carries their voice, so it stays mounted (only visually hidden) when hidden or minimized.
import {
	useEffect,
	useRef,
	useState,
	useSyncExternalStore,
	type KeyboardEvent,
	type PointerEvent,
	type ReactNode,
	type Ref,
	type RefObject,
} from "react";
import { EyeSlash, Heart, Microphone, MicrophoneSlash, Minus, SpeakerHigh, VideoCamera, VideoCameraSlash } from "@phosphor-icons/react";
import { other } from "../shared/types";
import { Face } from "./Character";
import { JarReveal } from "./Memories";
import { profileOf, useRoom, type RoomState } from "./room";
import { setCam, setMic, useCall, type CallState } from "./rtc";
import { clamp, NudgeListener, saveView, setSpot, setView, useLive, useVideo, useView, type LayoutMode, type Spot, type Vars } from "./Theater";
import "./theater.css";

const M = 12; // gap from the viewport edge
const GAP = 12; // gap between the two default bubbles
const CAP = 30; // name tag under a bubble (figcaption height + the gap above it, see .fc-cam in theater.css)
const MIN = 64;
// Theater: small over the movie, big when idle. Other pages: modest, so page content stays clear.
const DEFAULTS = { movie: { them: 170, me: 110 }, idle: { them: 240, me: 150 }, page: { them: 150, me: 100 } };
const KEYS: Record<string, [number, number, number]> = {
	ArrowLeft: [-24, 0, 0],
	ArrowRight: [24, 0, 0],
	ArrowUp: [0, -24, 0],
	ArrowDown: [0, 24, 0],
	"+": [0, 0, 12],
	"=": [0, 0, 12],
	"-": [0, 0, -12],
};

const onHash = (fn: () => void) => {
	addEventListener("hashchange", fn);
	return () => removeEventListener("hashchange", fn);
};
const readOnTheater = () => location.hash.replace(/^#\/?/, "") === "theater";

/** Voice loudness (0..1) as --level on an element: the talking halo grows and the head bobs. Set per frame, never React state. */
function useVoiceLevel(ref: RefObject<HTMLElement | null>, stream: MediaStream | null) {
	const track = stream?.getAudioTracks()[0];
	useEffect(() => {
		const el = ref.current;
		if (!el || !track || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
		const ctx = new AudioContext();
		// Chrome feeds a remote track to Web Audio only while it also plays in a media element: the bubble's <video> does.
		const source = ctx.createMediaStreamSource(new MediaStream([track]));
		const analyser = ctx.createAnalyser();
		analyser.fftSize = 512;
		source.connect(analyser);
		const buf = new Uint8Array(analyser.fftSize);
		let level = 0;
		let shown = "";
		let raf = 0;
		const tick = () => {
			analyser.getByteTimeDomainData(buf);
			let sum = 0;
			for (const v of buf) sum += (v - 128) ** 2;
			const target = Math.min(1, (Math.sqrt(sum / buf.length) / 128) * 6); // speech RMS sits around 0.02 to 0.15
			level += (target - level) * (target > level ? 0.5 : 0.12); // quick rise, soft fall
			const s = level.toFixed(2);
			if (s !== shown) el.style.setProperty("--level", (shown = s));
			raf = requestAnimationFrame(tick);
		};
		void ctx.resume();
		tick();
		return () => {
			cancelAnimationFrame(raf);
			source.disconnect();
			void ctx.close();
			el.style.removeProperty("--level");
		};
	}, [ref, track]);
}

const readViewport = () => [document.documentElement.clientWidth, document.documentElement.clientHeight] as const;
function useViewport() {
	const [vp, setVp] = useState(readViewport);
	useEffect(() => {
		const sync = () => setVp(readViewport());
		addEventListener("resize", sync);
		return () => removeEventListener("resize", sync);
	}, []);
	return vp;
}

export default function FaceCams() {
	const room = useRoom();
	const call = useCall();
	return (
		<>
			{room && <Bubbles room={room} call={call} />}
			<NudgeListener />
			<JarReveal />
		</>
	);
}

function Bubbles({ room, call }: { room: RoomState; call: CallState }) {
	const v = useView();
	const [vw, vh] = useViewport();
	const onTheater = useSyncExternalStore(onHash, readOnTheater);
	const partner = other(room.you);
	const me = profileOf(room, room.you);
	const them = profileOf(room, partner);
	const partnerHere = room.online.some((p) => p.who === partner);
	const theirs = useVideo(call.remoteCam, false);
	const mine = useVideo(call.localCam, true);
	const theirLive = useLive(call.remoteCam); // false with no camera on their side, so their head shows instead of black
	const seeThem = partnerHere && theirLive && call.peerCamOn;
	const seeMe = call.camOn && !!call.localCam?.getVideoTracks().length;
	const themRef = useRef<HTMLElement>(null);
	const meRef = useRef<HTMLElement>(null);
	useVoiceLevel(themRef, call.remoteCam);
	useVoiceLevel(meRef, call.localCam);

	const mode: LayoutMode = !onTheater ? "page" : call.localScreen || call.peerSharing ? "movie" : "idle";
	const layout = v[mode];
	const max = Math.max(MIN, Math.round(vw * 0.45));
	const shrink = Math.min(1, vw / 900); // smaller defaults on phones
	const sizeOf = (s: Spot, d: number) => clamp(s.size ?? Math.round(d * shrink), MIN, max);
	const themSize = sizeOf(layout.them, DEFAULTS[mode].them);
	const meSize = sizeOf(layout.me, DEFAULTS[mode].me);
	const area = { vw, vh, max, mode };

	return (
		<aside className="fc-layer" aria-label="Face cams">
			<Bubble
				ref={meRef}
				who="me"
				spot={layout.me}
				size={meSize}
				defLeft={vw - M - themSize - GAP - meSize}
				area={area}
				hidden={v.min || v.hideSelf}
				color={me.color}
				label={`Your bubble (${me.name})`}
				hideLabel={`Hide my self-view (${them.name} still sees you)`}
				onHide={() => setView({ hideSelf: true })}
				caption={me.name}
				controls={
					<>
						<button
							className={`fc-ctl${call.micOn ? "" : " off"}`}
							aria-pressed={call.micOn}
							aria-label={call.micOn ? "Mute my mic" : "Unmute my mic"}
							title={call.micOn ? "Mute my mic" : "Unmute my mic"}
							onClick={() => setMic(!call.micOn)}
						>
							{call.micOn ? <Microphone aria-hidden /> : <MicrophoneSlash aria-hidden />}
						</button>
						<button
							className={`fc-ctl${call.camOn ? "" : " off"}`}
							aria-pressed={call.camOn}
							aria-label={call.camOn ? "Turn my camera off" : "Turn my camera on"}
							title={call.camOn ? "Turn my camera off" : "Turn my camera on"}
							onClick={() => void setCam(!call.camOn)}
						>
							{call.camOn ? <VideoCamera aria-hidden /> : <VideoCameraSlash aria-hidden />}
						</button>
					</>
				}
			>
				<video ref={mine.ref} playsInline className={seeMe ? "" : "off"} aria-hidden="true" />
				{!seeMe && (
					<span className="fc-head">
						<Face who={room.you} s="100%" rw="0" />
					</span>
				)}
			</Bubble>
			<Bubble
				ref={themRef}
				who="them"
				spot={layout.them}
				size={themSize}
				defLeft={vw - M - themSize}
				area={area}
				hidden={v.min || v.hidePartner}
				color={them.color}
				label={`${them.name}'s bubble`}
				hideLabel={`Hide ${them.name}'s cam (you'll still hear them)`}
				onHide={() => setView({ hidePartner: true })}
				caption={them.name}
				connecting={partnerHere && call.connection !== "connected"}
			>
				{partnerHere && !call.peerMicOn && (
					<span className="fc-mic-off" title={`${them.name}'s mic is off`}>
						<MicrophoneSlash aria-hidden />
					</span>
				)}
				<video ref={theirs.ref} playsInline className={seeThem ? "" : "off"} aria-label={`${them.name}'s camera`} />
				{!seeThem && (
					<span className="fc-head">
						<Face
							who={partner}
							s="100%"
							rw="0"
							mood={partnerHere ? "idle" : "away"}
							label={partnerHere ? `${them.name} (${call.peerCamOn ? "no picture yet" : "camera off"})` : `${them.name} is away`}
						/>
					</span>
				)}
			</Bubble>
			{theirs.blocked && (
				<button className="btn sm paper fc-sound" onClick={theirs.unblock}>
					<SpeakerHigh aria-hidden />
					Tap to hear {them.name}
				</button>
			)}
			{(v.min || v.hidePartner || v.hideSelf) && (
				<button
					className="btn icon paper fc-restore"
					aria-label="Show the cams again"
					title="Show the cams again"
					onClick={() => setView({ min: false, hidePartner: false, hideSelf: false })}
				>
					<Heart weight="fill" aria-hidden />
				</button>
			)}
		</aside>
	);
}

type Area = { vw: number; vh: number; max: number; mode: LayoutMode };
type Drag = { x: number; y: number; left: number; top: number; size: number; kind: "move" | "size"; sx: number; sy: number };

function Bubble(props: {
	ref?: Ref<HTMLElement>;
	who: "me" | "them";
	spot: Spot;
	size: number;
	defLeft: number;
	area: Area;
	hidden: boolean;
	color: string;
	label: string;
	hideLabel: string;
	onHide: () => void;
	caption: string;
	/** Partner is here but the call is not connected yet: a steel ring. */
	connecting?: boolean;
	/** Always-visible buttons on the bubble's bottom edge (my mic/camera). */
	controls?: ReactNode;
	children: ReactNode;
}) {
	const { who, spot, size, area, hidden } = props;
	const { vw, vh, max, mode } = area;
	const free = (s: number) => [Math.max(0, vw - 2 * M - s), Math.max(0, vh - 2 * M - s - CAP)] as const;
	const [freeX, freeY] = free(size);
	const left = spot.fx !== undefined ? M + spot.fx * freeX : clamp(props.defLeft, M, M + freeX);
	const top = spot.fy !== undefined ? M + spot.fy * freeY : M + freeY; // default: bottom edge
	// The resize handle sits on the corner facing the middle of the screen.
	const sx = left + size / 2 > vw / 2 ? -1 : 1;
	const sy = top + size / 2 > vh / 2 ? -1 : 1;

	const drag = useRef<Drag | null>(null);
	const [dragging, setDragging] = useState(false);

	/** Store position as a fraction of the free space, so it survives window resizes. */
	const put = (l: number, t: number, s: number, withSize: boolean, persist: boolean) => {
		const [fx, fy] = free(s);
		setSpot(mode, who, { ...(withSize ? { size: s } : {}), fx: fx ? clamp((l - M) / fx, 0, 1) : 0, fy: fy ? clamp((t - M) / fy, 0, 1) : 0 }, persist);
	};
	const down = (e: PointerEvent<HTMLElement>, kind: Drag["kind"]) => {
		if (e.button !== 0 || (kind === "move" && (e.target as HTMLElement).closest("button"))) return;
		e.stopPropagation();
		e.currentTarget.setPointerCapture(e.pointerId);
		drag.current = { x: e.clientX, y: e.clientY, left, top, size, kind, sx, sy };
		setDragging(true);
	};
	const move = (e: PointerEvent<HTMLElement>) => {
		const d = drag.current;
		if (!d) return;
		const dx = e.clientX - d.x;
		const dy = e.clientY - d.y;
		if (d.kind === "move") return put(d.left + dx, d.top + dy, d.size, false, false);
		// Drag the handle outward to grow; the opposite side of the bubble stays put.
		const s = clamp(Math.round(d.size + Math.max(d.sx * dx, d.sy * dy)), MIN, max);
		put(d.sx < 0 ? d.left + d.size - s : d.left, d.sy < 0 ? d.top + d.size - s : d.top, s, true, false);
	};
	const up = () => {
		if (!drag.current) return;
		drag.current = null;
		setDragging(false);
		saveView();
	};
	const key = (e: KeyboardEvent<HTMLElement>) => {
		const k = KEYS[e.key];
		if (!k || e.target !== e.currentTarget) return;
		e.preventDefault();
		const s = clamp(size + k[2], MIN, max);
		put(left + k[0], top + k[1], s, k[2] !== 0, true);
	};

	return (
		<figure
			ref={props.ref}
			className={`fc-cam ${who}${hidden ? " hidden" : ""}${dragging ? " dragging" : ""}${props.connecting ? " connecting" : ""}`}
			style={{ "--size": `${size}px`, "--who": props.color, left, top } as Vars}
			role="group"
			tabIndex={0}
			inert={hidden}
			aria-label={`${props.label}. Drag or use the arrow keys to move it, plus and minus to resize.`}
			onPointerDown={(e) => down(e, "move")}
			onPointerMove={move}
			onPointerUp={up}
			onPointerCancel={up}
			onKeyDown={key}
		>
			<div className="fc-bubble">{props.children}</div>
			{props.controls && <div className="fc-controls">{props.controls}</div>}
			<figcaption>{props.caption}</figcaption>
			<div className="fc-tools">
				<button className="fc-tool" aria-label={props.hideLabel} title={props.hideLabel} onClick={props.onHide}>
					<EyeSlash aria-hidden />
				</button>
				<button className="fc-tool" aria-label="Minimize the cams" title="Minimize the cams" onClick={() => setView({ min: true })}>
					<Minus aria-hidden />
				</button>
			</div>
			<span className={`fc-handle ${sx < 0 ? "l" : "r"} ${sy < 0 ? "t" : "b"}`} aria-hidden="true" onPointerDown={(e) => down(e, "size")} />
		</figure>
	);
}
