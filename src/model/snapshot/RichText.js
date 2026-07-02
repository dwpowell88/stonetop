import { renderMarkdown, enrichGameText } from "../../utils/enrichGameText.js";

/**
 * A render-layer value type for game text stored as markdown. It is the single shape that carries
 * "this string is rich text" across the snapshot/getData boundary, so render sites never have to
 * decide how to render text — they render a RichText, one way, via the {{rich}} helper.
 *
 * Two states: `raw` (the stored markdown) and `html` (the enriched output, filled by the async
 * enrich pass). `render()` falls back to synchronous markdown when html is unset, so text shows
 * correctly with no flicker even before/without enrichment — tokens just aren't clickable yet.
 *
 * Build one with `rich(value)` — never `new RichText(...)` directly.
 */
export class RichText {
	constructor(raw = "", autoRoll = false) {
		this.raw      = raw ?? "";
		this.autoRoll = autoRoll;
		this.html     = null;
	}

	/** Sync render: enriched html if present, else markdown (no flicker). */
	render() {
		return this.html ?? renderMarkdown(this.raw);
	}

	/** Async enrich: full pipeline (markdown + dice + @UUID), via Foundry's enrichHTML. */
	async enrich(rollData = {}) {
		this.html = await enrichGameText(this.raw, { rollData, autoRoll: this.autoRoll });
		return this;
	}
}

/**
 * The single entry point for wrapping game text. Accepts a string, null/undefined, a non-string
 * (coerced), or an existing RichText (returned as-is — idempotent). `{ roll: true }` turns bare
 * dice into roll buttons (creature stat lines); default off so prose/titles never become dice.
 */
export function rich(value, { roll = false } = {}) {
	if (value instanceof RichText) return value;
	if (value == null) return new RichText("", roll);
	return new RichText(String(value), roll);
}

/**
 * True when a value carries renderable text — works for a bare string OR a RichText, so shared
 * partials can guard an optional note/subtitle with `{{#if (hasText note)}}` regardless of whether
 * the caller passed a localized string or a wrapped RichText. Reuses `rich()` so the rule lives in
 * one place.
 */
export function hasText(value) {
	return rich(value).raw.trim().length > 0;
}
