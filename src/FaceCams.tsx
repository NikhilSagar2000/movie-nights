// Round cam bubbles floating over every page: draggable, resizable, hideable, per device.
// The partner's <video> carries their voice, so it stays mounted (only visually hidden) when hidden or minimized.
import { useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { other } from "../shared/types";
import { JarReveal } from "./Memories";
import { profileOf, useRoom, type RoomState } from "./room";
import { setCam, setMic, useCall, type CallState } from "./rtc";
import Teddy from "./Teddy";
import { clamp, Icon, NudgeListener, saveView, setSpot, setView, useLive, useVideo, useView, type LayoutMode, type Spot, type Vars } from "./Theater";
import "./theater.css";

const M = 12; // gap from the viewport edge
const GAP = 12; // gap between the two default bubbles
const CAP = 30; // name tag under a bubble
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
	const theirLive = useLive(call.remoteCam); // false with no camera on their side, so a teddy shows instead of black
	const seeThem = partnerHere && theirLive && call.peerCamOn;
	const seeMe = call.camOn && !!call.localCam?.getVideoTracks().length;

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
							<Icon name="mic" off={!call.micOn} />
						</button>
						<button
							className={`fc-ctl${call.camOn ? "" : " off"}`}
							aria-pressed={call.camOn}
							aria-label={call.camOn ? "Turn my camera off" : "Turn my camera on"}
							title={call.camOn ? "Turn my camera off" : "Turn my camera on"}
							onClick={() => void setCam(!call.camOn)}
						>
							<Icon name="cam" off={!call.camOn} />
						</button>
					</>
				}
			>
				<video ref={mine.ref} playsInline className={seeMe ? "" : "off"} aria-hidden="true" />
				{!seeMe && (
					<span className="fc-teddy">
						<Teddy mood="idle" size={Math.round(meSize * 0.6)} accent={me.color} />
					</span>
				)}
			</Bubble>
			<Bubble
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
				caption={`${them.name}${partnerHere ? "" : " 💤"}`}
			>
				{partnerHere && !call.peerMicOn && (
					<span className="fc-mic-off" title={`${them.name}'s mic is off`}>
						<Icon name="mic" off />
					</span>
				)}
				<video ref={theirs.ref} playsInline className={seeThem ? "" : "off"} aria-label={`${them.name}'s camera`} />
				{!seeThem && (
					<span className="fc-teddy">
						<Teddy
							mood={partnerHere ? "wave" : "sleep"}
							size={Math.round(themSize * 0.6)}
							accent={them.color}
							label={partnerHere ? `${them.name} (no picture yet)` : `${them.name} is away`}
						/>
					</span>
				)}
			</Bubble>
			{theirs.blocked && (
				<button className="btn sm fc-sound" onClick={theirs.unblock}>
					🔊 Tap to hear {them.name}
				</button>
			)}
			{(v.min || v.hidePartner || v.hideSelf) && (
				<button
					className="btn icon soft fc-restore"
					aria-label="Show the cams again"
					title="Show the cams again"
					onClick={() => setView({ min: false, hidePartner: false, hideSelf: false })}
				>
					<Icon name="heart" filled />
				</button>
			)}
		</aside>
	);
}

type Area = { vw: number; vh: number; max: number; mode: LayoutMode };
type Drag = { x: number; y: number; left: number; top: number; size: number; kind: "move" | "size"; sx: number; sy: number };

function Bubble(props: {
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
			className={`fc-cam ${who}${hidden ? " hidden" : ""}${dragging ? " dragging" : ""}`}
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
					<Icon name="eye" off />
				</button>
				<button className="fc-tool" aria-label="Minimize the cams" title="Minimize the cams" onClick={() => setView({ min: true })}>
					<Icon name="minus" />
				</button>
			</div>
			<span className={`fc-handle ${sx < 0 ? "l" : "r"} ${sy < 0 ? "t" : "b"}`} aria-hidden="true" onPointerDown={(e) => down(e, "size")} />
		</figure>
	);
}
