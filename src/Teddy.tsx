// PLACEHOLDER — replaced by the real animated SVG teddy.
export type Mood = "idle" | "wave" | "sleep" | "love" | "cheer" | "peek" | "cover" | "popcorn" | "sad" | "think";

export type TeddyProps = {
	mood?: Mood;
	size?: number;
	/** Bow/scarf color — each person's profile color. */
	accent?: string;
	className?: string;
	/** Accessible label; decorative (aria-hidden) when omitted. */
	label?: string;
};

export default function Teddy({ size = 120, className, label }: TeddyProps) {
	return (
		<span className={className} style={{ fontSize: size * 0.8, lineHeight: 1 }} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
			🧸
		</span>
	);
}
