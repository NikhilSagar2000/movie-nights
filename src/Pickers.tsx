// Pickers shared by the dress-up page and the gift builder: colour swatches and one-of-several pills (radios underneath).
import type { ReactNode } from "react";
import { Check } from "@phosphor-icons/react";
import "./pickers.css";

/** [value, name, what the dot shows]. */
export type Swatch = [value: string, name: string, dot?: string];
/** Dark dots get a light tick. */
export const dark = (hex: string) => {
	const n = parseInt(hex.slice(1), 16);
	return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) < 120;
};

export function Swatches({ label, name, options, value, onPick, small }: { label: string; name: string; options: Swatch[]; value: string; onPick: (v: string) => void; small?: boolean }) {
	return (
		<fieldset className={`hm-swatches${small ? " pk-small" : ""}`}>
			<legend className="sr-only">{label}</legend>
			<div className="hm-swatch-row">
				{options.map(([v, text, dot = v]) => (
					<label key={v} className="hm-swatch" title={text}>
						<input type="radio" className="sr-only" name={name} value={v} checked={value === v} onChange={() => onPick(v)} />
						<span className={`hm-swatch-dot${dark(dot) ? " pk-dark" : ""}`} style={{ background: dot }}>
							{value === v && <Check aria-hidden weight="bold" />}
						</span>
						<span className="sr-only">{text}</span>
					</label>
				))}
			</div>
		</fieldset>
	);
}

export function Pills({ label, name, options, value, onPick }: { label: string; name: string; options: [string, ReactNode][]; value: string; onPick: (v: string) => void }) {
	return (
		<fieldset className="pk-pills">
			<legend className="sr-only">{label}</legend>
			{options.map(([v, text]) => (
				<label key={v} className="pk-pill">
					<input type="radio" className="sr-only" name={name} value={v} checked={value === v} onChange={() => onPick(v)} />
					<span>{text}</span>
				</label>
			))}
		</fieldset>
	);
}
