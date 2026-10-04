// Send a pic: snap one (your call camera, or one opened just for this) or pick one, write on it, stick it on the fridge.
// Lazy: only loaded when the fridge's note is tapped.
import { useEffect, useRef, useState } from "react";
import { ArrowCounterClockwise, Camera, ImageSquare, X } from "@phosphor-icons/react";
import { LIMITS, other } from "../shared/types";
import { profileOf, type RoomState } from "./room";
import { useCall } from "./rtc";

const LONG = 1600; // the long side, in pixels
const SMALL = 900_000; // try lower qualities until it's this small (the Room takes up to LIMITS.picBytes)

/** The canvas as a JPEG small enough to send, or null. */
async function jpeg(c: HTMLCanvasElement) {
	let last: Blob | null = null;
	for (const q of [0.85, 0.72, 0.6]) {
		last = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", q));
		if (last && last.size <= SMALL) return last;
	}
	return last && last.size <= LIMITS.picBytes ? last : null;
}

/** A canvas `w`×`h` scaled so its long side fits LONG. */
function canvasFor(w: number, h: number) {
	const k = Math.min(1, LONG / Math.max(w, h));
	const c = document.createElement("canvas");
	c.width = Math.round(w * k);
	c.height = Math.round(h * k);
	return c;
}

export default function PicTaker({ room, onClose }: { room: RoomState; onClose: () => void }) {
	const ref = useRef<HTMLDialogElement>(null);
	const video = useRef<HTMLVideoElement>(null);
	const file = useRef<HTMLInputElement>(null);
	const call = useCall();
	const callCam = call.camOn && call.localCam?.getVideoTracks().length ? call.localCam : null;
	const [own, setOwn] = useState<MediaStream | null>(null); // a camera opened just for this, while the call's is off
	const stream = callCam ?? own;
	const [shot, setShot] = useState<{ blob: Blob; url: string } | null>(null);
	const [note, setNote] = useState("");
	const [busy, setBusy] = useState(false);
	const [err, setErr] = useState("");
	const [flash, setFlash] = useState(0);
	const [leaving, setLeaving] = useState(false);
	const them = profileOf(room, other(room.you));

	useEffect(() => {
		if (!ref.current?.open) ref.current?.showModal();
	}, []);
	useEffect(() => {
		if (video.current && video.current.srcObject !== stream) video.current.srcObject = stream;
	}, [stream, shot]);
	// the camera opened for this goes off when it closes (the call's stays as it was)
	useEffect(() => () => own?.getTracks().forEach((t) => t.stop()), [own]);
	useEffect(() => () => void (shot && URL.revokeObjectURL(shot.url)), [shot]);

	const close = () => ref.current?.close();

	async function openCam() {
		setErr("");
		const cam = await navigator.mediaDevices?.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 960 } } }).catch(() => null);
		if (cam) setOwn(cam);
		else setErr("The camera didn't open. You can pick a photo instead.");
	}

	async function keep(c: HTMLCanvasElement) {
		const blob = await jpeg(c);
		if (!blob) return setErr("That photo is too big to send. Try another?");
		setErr("");
		setShot({ blob, url: URL.createObjectURL(blob) });
	}

	function snap() {
		const v = video.current;
		if (!v?.videoWidth) return;
		const c = canvasFor(v.videoWidth, v.videoHeight);
		const g = c.getContext("2d")!;
		g.translate(c.width, 0); // mirrored, exactly like the viewfinder (and your bubble)
		g.scale(-1, 1);
		g.drawImage(v, 0, 0, c.width, c.height);
		setFlash((f) => f + 1);
		void keep(c);
	}

	async function pick(f: File | undefined) {
		if (!f) return;
		// an <img> reads which way up a phone photo goes (and draws it that way round), in every browser
		const img = new Image();
		img.src = URL.createObjectURL(f);
		const ok = await img.decode().then(
			() => true,
			() => false,
		);
		URL.revokeObjectURL(img.src);
		if (!ok || !img.naturalWidth) return setErr("Couldn't open that one. Try a JPEG or PNG?");
		const c = canvasFor(img.naturalWidth, img.naturalHeight);
		c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
		void keep(c);
	}

	async function stick() {
		if (!shot || busy) return;
		setBusy(true);
		setErr("");
		const res = await fetch(`/api/pic?note=${encodeURIComponent(note.trim())}`, {
			method: "POST",
			headers: { "Content-Type": "image/jpeg" },
			body: shot.blob,
		}).catch(() => null);
		setBusy(false);
		if (res?.ok) {
			setLeaving(true); // off it goes to the fridge
			setTimeout(close, matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 650);
		} else setErr(res?.status === 409 ? `${them.name} already opened today's, so it stays up till tomorrow.` : "It didn't stick. Try again?");
	}

	return (
		<dialog ref={ref} className="fr-take" aria-label={`A photo for ${them.name}`} onClose={onClose} onClick={(e) => e.target === e.currentTarget && close()}>
			<h2 className="fr-take-h">a photo for {them.name}</h2>
			<div className={`fr-take-card${leaving ? " away" : ""}`}>
				<div className="fr-take-photo">
					{shot ? (
						<img className="fr-develop" src={shot.url} alt="Your photo" />
					) : stream ? (
						<video ref={video} className="fr-finder" autoPlay muted playsInline aria-label="Your camera" />
					) : (
						<button className="fr-take-empty" onClick={() => void openCam()}>
							<Camera aria-hidden weight="duotone" />
							<span>open the camera</span>
						</button>
					)}
					{flash > 0 && <i key={flash} className="fr-flash" aria-hidden="true" />}
				</div>
				<input
					className="fr-take-note"
					value={note}
					onChange={(e) => setNote(e.target.value)}
					maxLength={LIMITS.picNote}
					placeholder="write on it…"
					aria-label="Write on it"
					disabled={!shot}
				/>
			</div>
			{err && (
				<p className="fr-take-err" role="alert">
					{err}
				</p>
			)}
			<div className="fr-take-acts">
				{shot ? (
					<>
						<button className="btn paper" onClick={() => setShot(null)} disabled={busy}>
							<ArrowCounterClockwise aria-hidden weight="bold" />
							Another
						</button>
						<button className="btn blush" onClick={() => void stick()} disabled={busy || leaving}>
							{busy ? "Sticking…" : "Stick it on the fridge"}
						</button>
					</>
				) : (
					<>
						<button className="btn paper" onClick={() => file.current?.click()}>
							<ImageSquare aria-hidden weight="bold" />
							Pick one
						</button>
						{stream && (
							<button className="fr-shutter" onClick={snap} aria-label="Take the photo">
								<i />
							</button>
						)}
					</>
				)}
			</div>
			<input ref={file} type="file" accept="image/*" hidden onChange={(e) => void pick(e.target.files?.[0]).finally(() => (e.target.value = ""))} />
			<button className="btn ghost icon sm fr-view-x" onClick={close} aria-label="Close">
				<X aria-hidden />
			</button>
		</dialog>
	);
}
