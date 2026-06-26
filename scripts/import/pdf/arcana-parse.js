// Map a per-arcanum block chunk (from layout.js extractArticle) to the ArcanumData shape
// (src/data/ArcanumData.js front/back). The checkbox glyphs □/◻ (pick/track), ◇ (item load pip) and
// ○/◯ (resource/loyalty) are injected by load.js from the vector layer; circles also arrive as the
// font's text-layer "l" glyph in some tracks.
//
// Pure helpers (parseTrack/stripMarkers/splitLoyalty/parseItemLine/unlockSlug/joinMd) are unit-tested
// in tests/import/pdf/arcana-parse.test.js. parseFront/parseBack are exercised via build-arcana's
// divergence report against the hand-authored JSON.
import { isItalic, isBoldBody, isDingbat } from "./fonts.js";
import { toSlug } from "../../../src/utils/slug.js";

// ─── spans → markdown ─────────────────────────────────────────────────────────
const MD = { b: ["**", "**"], i: ["*", "*"], bi: ["**_", "_**"] };
const emphOf = (f) => (isItalic(f) && isBoldBody(f) ? "bi" : isItalic(f) ? "i" : isBoldBody(f) ? "b" : "");

function mdSpans(spans) {
	const toks = [];
	for (const s of spans) {
		if (isDingbat(s.font) || s.font === "marker") continue;
		const emph = emphOf(s.font);
		const last = toks[toks.length - 1];
		if (last && last.emph === emph) last.text += s.text;
		else toks.push({ emph, text: s.text });
	}
	let out = "";
	for (const t of toks) {
		if (!t.emph) { out += t.text; continue; }
		const m = t.text.match(/^(\s*)(.*?)(\s*)$/s);
		out += m[2] ? `${m[1]}${MD[t.emph][0]}${m[2]}${MD[t.emph][1]}${m[3]}` : t.text;
	}
	return out;
}

/** Join lines to one markdown string; de-hyphenate, keep "…" options on their own line. */
export function joinMd(lines) {
	let out = "", prev = null;
	for (const l of lines) {
		const h = mdSpans(l.spans).replace(/^[□◻◇○◯]\s*/, "").trim();
		const raw = l.text.trim();
		if (prev == null) out = h;
		else if (/^(?:…|\.\.\.)/.test(raw)) out += "\n" + h;
		else if (/[A-Za-z]-$/.test(prev) && /^[a-z]/.test(raw)) out = out.replace(/-((?:[*_]+)?)$/, "$1") + h;
		else out += " " + h;
		prev = raw;
	}
	return out.replace(/[ \t]{2,}/g, " ").trim();
}

// ─── pure helpers ─────────────────────────────────────────────────────────────
const MARK = /[□◻○◯◇]/g;

/** Remove box/circle/diamond glyphs from text (keeps markdown emphasis), collapse spaces. */
export function stripMarkers(text) {
	return text.replace(MARK, "").replace(/\s{2,}/g, " ").trim();
}

/** A run of N checkbox glyphs → `{max:N}` plus the residual text. Counts box/circle/diamond glyphs
 *  anywhere, plus a *pure* run of the font's text-layer circle glyph ("l l l l l"). */
export function parseTrack(raw) {
	const boxes = (raw.match(MARK) || []).length;
	const stripped = raw.replace(MARK, "").trim();
	const lRun = /^(?:l\s*)+$/.test(stripped) ? (stripped.match(/l/g) || []).length : 0;
	return { max: boxes + lRun, text: lRun ? "" : stripped.replace(/\s{2,}/g, " ").trim() };
}

/** Pull a trailing "(Loyalty ◯◯◯)" off a follower cost line → `{cost, loyaltyMax}`. */
export function splitLoyalty(costRaw) {
	const m = costRaw.match(/\(\s*loyalty\s+([○◯\s]+)\)\s*$/i);
	if (!m) return { cost: costRaw.trim(), loyaltyMax: null };
	return { cost: costRaw.slice(0, m.index).trim(), loyaltyMax: (m[1].match(/[○◯]/g) || []).length };
}

/** The item tags line under a title → an outfit-item-shaped object (name = arcanum name, weight from
 *  ◇ pips, note = the comma tags). null when there's nothing. */
export function parseItemLine(text, { name, pips = 0 } = {}) {
	const note = text.replace(/^[◇○□◻\s,]+/, "").replace(/\s{2,}/g, " ").trim();
	const diamonds = (text.match(/◇/g) || []).length;
	if (!note && !pips && !diamonds) return null;
	return { name, weight: pips || diamonds || 1, note: note || null, inventoryColumn: "regular" };
}

const STOP = new Set("a an the to of and or you your must can will would it its is are be with for from while into on at".split(" "));
/** A deterministic kebab slug from an unlock option's salient words (editorial slugs aren't
 *  mechanically reproducible; this is stable + readable). */
export function unlockSlug(text) {
	const words = stripMarkers(text).toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w && !STOP.has(w));
	return toSlug(words.slice(0, 2).join(" ")) || "step";
}

// ─── blocks → front/back ──────────────────────────────────────────────────────
const markerKind = (line) => { const t = (line?.text || "").trim(); return /^[□◻]/.test(t) ? "square" : /^◇/.test(t) ? "diamond" : /^[○◯]/.test(t) ? "circle" : null; };
const rawOf = (lines) => (lines || []).map((l) => l.text).join(" ");
const isHead = (b, re) => (b?.type === "heading" || b?.type === "title") && re.test(b.line.text.trim());

/** Build the front side from its blocks (already bounded to one card's front). */
export function parseFront(blocks, { name, slug }) {
	const front = { title: name, item: null, description: null, unlock: null };
	let item = null, pips = 0;
	const seq = []; // ordered { kind, text?, lines? }

	for (const b of blocks) {
		if (b.type !== "para" && b.type !== "list") continue;
		const raw = b.type === "list" ? rawOf(b.items.flat()) : rawOf(b.lines);
		// pips-only block ("◇" / "◇ ◇") sets the item load
		if (!seq.length && /◇/.test(raw) && !/[A-Za-z]/.test(raw)) { pips += (raw.match(/◇/g) || []).length; continue; }
		// item tags line (leading comma, or a layout-tagged tags para), before any option content
		if (!item && !seq.length) {
			const oneLine = b.type === "para" ? joinMd(b.lines) : b.items.length === 1 ? joinMd(b.items[0]) : null;
			if (oneLine != null && (b.tags || /^,/.test(oneLine.replace(/^[◇○□◻\s]+/, "")))) {
				item = parseItemLine(oneLine, { name, pips });
				continue;
			}
		}
		if (b.type === "list") for (const it of b.items) seq.push({ kind: "li", lines: it });
		else seq.push({ kind: "para", lines: b.lines });
	}
	front.item = item;

	// description = paras before the first option (li); unlock = the intro para + every li/para after.
	const firstLi = seq.findIndex((s) => s.kind === "li");
	if (firstLi < 0) {
		front.description = seq.map((s) => joinMd(s.lines)).filter(Boolean).join("\n\n") || null;
		return front;
	}
	const introAt = Math.max(0, firstLi - 1);
	front.description = seq.slice(0, introAt).map((s) => joinMd(s.lines)).filter(Boolean).join("\n\n") || null;

	const list = [];
	for (const s of seq.slice(introAt)) {
		const raw = rawOf(s.lines);
		const { max } = parseTrack(raw);
		const text = stripMarkers(joinMd(s.lines));
		if (s.kind === "li" || max > 0) {
			const row = { type: "entry", content: { title: null, text } };
			if (text) row.slug = unlockSlug(text);
			if (max > 0) row.track = { max: 1 }; // each unlock option is a single mark
			list.push(row);
		} else {
			list.push({ type: "entry", content: { title: null, text } });
		}
	}
	front.unlock = { slug, list };
	return front;
}

/** Build the back side (the spell / mysteries) from its blocks. Stat blocks (followers) are handled
 *  by build-arcana via toFollowerDoc; here we collect moves/consequences/resource. */
export function parseBack(blocks, { slug }) {
	const back = { title: null, item: null, description: null, resource: null, moves: [], consequences: null, unlockAt: null };
	let section = null; // null | "moves" | "consequences"
	const descParas = [];
	for (const b of blocks) {
		if (b.type === "heading" || b.type === "title") {
			const t = b.line.text.trim();
			if (/^mysteries of/i.test(t)) back.title = t;
			else if (/^moves$/i.test(t)) section = "moves";
			else if (/^consequences$/i.test(t)) section = "consequences";
			continue;
		}
		if (b.type === "rule" || b.type === "boxstart" || b.type === "boxend" || b.type === "table" || b.type === "statblock") continue;
		if (b.type === "list") {
			for (const it of b.items) {
				const raw = rawOf(it);
				const { max } = parseTrack(raw);
				const text = stripMarkers(joinMd(it));
				if (section === "moves") {
					const m = text.match(/^([A-Z][A-Z'’ ]{3,}?)\s+([A-Z(].*)$/s);
					back.moves.push(m ? { name: m[1].trim(), text: m[2].trim() } : { name: "", text });
				} else if (section === "consequences") {
					(back.consequences ??= { slug: "consequences", list: [] });
					const row = { type: "entry", slug: `${slug}-c${back.consequences.list.length + 1}`, content: { title: null, text } };
					if (max > 0) row.track = { max };
					back.consequences.list.push(row);
				}
			}
			continue;
		}
		if (b.type === "para" && section === null) descParas.push(joinMd(b.lines));
	}
	if (descParas.length) back.description = descParas.join("\n\n");
	return back;
}
