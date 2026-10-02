// YouTube's IFrame player API: the slice used by the theater (Tube.tsx) and the song radio (Radio.tsx). No types package
// exists for it; the script loads once, on first use.
export type YTPlayer = {
	playVideo(): void;
	pauseVideo(): void;
	seekTo(seconds: number, allowSeekAhead: boolean): void;
	loadVideoById(o: { videoId: string; startSeconds?: number }): void;
	cueVideoById(o: { videoId: string; startSeconds?: number }): void;
	getCurrentTime(): number | undefined;
	getDuration(): number | undefined;
	getPlayerState(): number;
	getIframe(): HTMLIFrameElement;
	setVolume(v: number): void;
	getVolume(): number;
	mute(): void;
	unMute(): void;
	isMuted(): boolean;
	destroy(): void;
};
type YTApi = { Player: new (el: HTMLElement, opts: object) => YTPlayer };
declare global {
	interface Window {
		YT?: YTApi;
		onYouTubeIframeAPIReady?: () => void;
	}
}
export const S = { ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 };
/** The player's position, or null while it can't say (mid-load it returns undefined). */
export const timeOf = (p: YTPlayer) => {
	const t = p.getCurrentTime();
	return typeof t === "number" && Number.isFinite(t) ? t : null;
};

let api: Promise<YTApi> | null = null;
export const loadApi = () =>
	(api ??= new Promise<YTApi>((resolve, reject) => {
		if (window.YT?.Player) return resolve(window.YT);
		const prev = window.onYouTubeIframeAPIReady;
		window.onYouTubeIframeAPIReady = () => {
			prev?.();
			resolve(window.YT!);
		};
		const s = document.createElement("script");
		s.src = "https://www.youtube.com/iframe_api";
		s.onerror = () => {
			api = null;
			reject(new Error("YouTube didn't load"));
		};
		document.head.appendChild(s);
	}));
