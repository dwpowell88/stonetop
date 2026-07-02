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
	// Straighten curly double-quotes (the book's typography) to ASCII " — keeps the JSON clean.
	return out.replace(/[“”]/g, '"').replace(/[ \t]{2,}/g, " ").trim();
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

/** Strip the "(Loyalty ◯◯◯)" annotation from a follower cost line. Loyalty is always max 3 (the
 *  schema default), so the marker count is discarded — we only want the clean cost text. Handles the
 *  book's noise: a "Loyalty:" colon, stray ○/l markers trailing the paren, and a loyalty-only line
 *  (no real cost) → "". */
export function stripLoyalty(costRaw) {
	return (costRaw || "")
		.replace(/\(\s*loyalty[:\s○◯l]*\)/ig, " ")   // a parenthesized "(Loyalty …)" anywhere
		.replace(/\bloyalty[:\s○◯l]*$/i, " ")         // a bare trailing "Loyalty ◯◯◯" (loyalty-only cost)
		.replace(/[○◯]/g, " ")                         // any leftover stray circle markers
		.replace(/\s{2,}/g, " ")
		.trim()
		.replace(/[,\s]+$/, "");
}

// ─── follower wiring / detection ────────────────────────────────────────────────
/** The single-pick choice row that links an arcanum back to one of its followers — the follower IS
 *  the row (empty content, `inlineDisplay`). Mirrors the hand-authored `beautiful-scroll` back. */
export function followerChoiceEntry(followerSlug) {
	return { type: "entry", slug: followerSlug, content: { title: null, text: "" }, track: { max: 1 }, inlineDisplay: true, followers: [followerSlug] };
}

/** A real arcanum follower stat block carries a small creature marker icon (~15–18px); the card's
 *  border decoration (~42px) and icon-less fragments are false positives, as are numeric page-number
 *  "names". Used to filter `statblock` blocks before parsing followers. */
export function isArcanaFollower(block) {
	const w = block?.icon?.w;
	if (!(typeof w === "number" && w < 25)) return false;
	const first = (block.lines || []).find((l) => (l.text || "").trim());
	return !!first && !/^\d+$/.test(first.text.trim());
}

/** The item tags line under a title → an outfit-item-shaped object (name = arcanum name, weight from
 *  ◇ pips). The book italicizes tags (`*close*`) and leaves stats/notes plain (`+1 damage`), so the
 *  italic runs become `tags` and the remaining plain text becomes `note`. null when there's nothing. */
export function parseItemLine(text, { name, pips = 0 } = {}) {
	const diamonds = (text.match(/◇/g) || []).length;
	const body = text.replace(/[◇○□◻◯]/g, "").replace(/\s{2,}/g, " ").trim();
	const clean = (parts) => parts.flatMap((p) => p.split(",")).map((s) => s.trim()).filter(Boolean).join(", ") || null;
	const tags = clean([...body.matchAll(/\*([^*]+)\*/g)].map((m) => m[1]));       // italic runs → tags
	const note = clean([body.replace(/\*[^*]+\*/g, " ")]);                          // plain remainder → note
	if (!tags && !note && !pips && !diamonds) return null;
	return { name, weight: pips || diamonds || 1, tags, note, inventoryColumn: "regular" };
}

const STOP = new Set("a an the to of and or you your must can will would it its is are be with for from while into on at".split(" "));
/** A deterministic kebab slug from an unlock option's salient words (editorial slugs aren't
 *  mechanically reproducible; this is stable + readable). */
export function unlockSlug(text) {
	const words = stripMarkers(text).toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w && !STOP.has(w));
	return toSlug(words.slice(0, 2).join(" ")) || "step";
}

// ─── major arcana helpers ───────────────────────────────────────────────────────
const MINOR_WORDS = new Set("a an the and or but for nor to in on at by with from as of".split(" "));
/** Title-case an ALL-CAPS mystery-move name, lowercasing minor words except the first
 *  ("SPIRITS OF THE HERD" → "Spirits of the Herd", "A FLICKERING FLAME" → "A Flickering Flame"). */
export function titleCase(s) {
	const words = (s || "").trim().toLowerCase().split(/\s+/).filter(Boolean);
	return words.map((w, i) => (i > 0 && MINOR_WORDS.has(w)) ? w : w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

/** A mystery move whose text begins "(Requires: A, B)" gates on those moves — pull the comma-listed
 *  move names into `requirement.moves` (display names, mirroring `call-the-spirits`) and strip the
 *  parenthetical from the text. Returns { moves: string[]|null, text }. */
export function parseRequires(text) {
	const m = (text || "").match(/^\(Requires?:\s*([^)]+)\)\s*/i);
	if (!m) return { moves: null, text };
	const moves = m[1].split(",").map((s) => s.trim()).filter(Boolean);
	return { moves: moves.length ? moves : null, text: text.slice(m[0].length) };
}

/** Split a major move header line's leading ALL-CAPS run (the move name) from any inline remainder
 *  ("WHISPERS When you grip the shaft" → {name:"WHISPERS", rest:"When you grip the shaft"}). */
export function majorMoveName(text) {
	const words = stripMarkers(text).trim().split(/\s+/);
	let n = 0;
	while (n < words.length && /^[A-Z0-9][A-Z0-9'’-]*$/.test(words[n])) n++;
	if (n < 1) return { name: "", rest: words.join(" ") };
	return { name: words.slice(0, n).join(" "), rest: words.slice(n).join(" ") };
}

/** The front's mark-gate count for unlocking the mysteries: an explicit "marked N", or the length of
 *  the standalone Marks run for "the last mark". Stored on `back.unlockAt`. */
export function detectUnlockAt(blocks) {
	const text = blocks.map((b) => b.type === "list" ? rawOf(b.items.flat()) : (b.lines ? rawOf(b.lines) : (b.line?.text ?? ""))).join(" ");
	if (!/unlock/i.test(text)) return null;
	const m = text.match(/marked\s+(\d+)/i);
	if (m) return Number(m[1]);
	if (/last mark/i.test(text)) {
		let max = 0;
		for (const b of blocks) if (b.type === "list") for (const it of b.items) { const { max: mx, text: t } = parseTrack(rawOf(it)); if (!t && mx > max) max = mx; }
		return max || null;
	}
	return null;
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
				// Load pips (◇) can sit inline on the item line, where joinMd strips only the first marker
				// glyph — count them from the raw text so a 2-pip item (rune-laden-scales) weighs 2.
				const inlinePips = ((b.type === "para" ? rawOf(b.lines) : rawOf(b.items[0])).match(/◇/g) || []).length;
				item = parseItemLine(oneLine, { name, pips: pips + inlinePips });
				continue;
			}
		}
		if (b.type === "list") for (const it of b.items) seq.push({ kind: "li", lines: it });
		else seq.push({ kind: "para", lines: b.lines });
	}
	front.item = item;

	// MAJOR-style unlock: the options are bold-italic "When you **_…_**" trigger paragraphs, each
	// accreting its following option bullets / continuation paras; task checkboxes and the Marks run are
	// their own tracked entries. (Minors have no such triggers — they fall through to the li logic below.)
	const isTriggerPara = (s) => s.kind === "para" && /^When you \*\*_/i.test(joinMd(s.lines).trim());
	if (seq.some(isTriggerPara)) {
		const firstTrig = seq.findIndex(isTriggerPara);
		front.description = seq.slice(0, firstTrig).map((s) => joinMd(s.lines)).filter(Boolean).join("\n\n") || null;
		const list = [];
		let cur = null;
		const flushCur = () => { if (cur) list.push(cur); cur = null; };
		for (const s of seq.slice(firstTrig)) {
			if (isTriggerPara(s)) {
				flushCur();
				cur = { type: "entry", content: { title: null, text: stripMarkers(joinMd(s.lines)) } };
			} else if (s.kind === "li") {
				const { max, text: residual } = parseTrack(rawOf(s.lines));
				if (max > 0 && !residual) { flushCur(); list.push({ type: "entry", slug: "marks", content: { title: null, text: "Marks" }, track: { max } }); }
				else if (max > 0) { flushCur(); const t = stripMarkers(joinMd(s.lines)); const row = { type: "entry", content: { title: null, text: t } }; if (t) row.slug = unlockSlug(t); row.track = { max }; list.push(row); }
				else if (cur) cur.content.text += "\n- " + stripMarkers(joinMd(s.lines)).replace(/^[ä••\-\s]+/, ""); // an option bullet of the current trigger
			} else if (cur) cur.content.text += "\n\n" + stripMarkers(joinMd(s.lines)); // a continuation para (trailing orphans drop with no cur)
		}
		flushCur();
		// Drop the trailing gate instruction ("When you make the last mark, you unlock …") after the track.
		if (list.some((e) => e.track)) while (list.length && !list[list.length - 1].track) list.pop();
		front.unlock = { slug, list };
		return front;
	}

	// description = paras before the first option (li); unlock = the intro para + every li/para after.
	const firstLi = seq.findIndex((s) => s.kind === "li");
	if (firstLi < 0) {
		front.description = seq.map((s) => joinMd(s.lines)).filter(Boolean).join("\n\n") || null;
		return front;
	}
	// The intro entry is the para right before the first option; majors precede it with several
	// bold-italic "When you **_…_**" trigger paras that are unlock entries too — pull them all in.
	const isTrigger = (s) => s?.kind === "para" && /^When you \*\*_/i.test(joinMd(s.lines).trim());
	let introAt = Math.max(0, firstLi - 1);
	while (introAt > 0 && isTrigger(seq[introAt - 1])) introAt--;
	front.description = seq.slice(0, introAt).map((s) => joinMd(s.lines)).filter(Boolean).join("\n\n") || null;

	const list = [];
	for (const s of seq.slice(introAt)) {
		const raw = rawOf(s.lines);
		const { max, text: residual } = parseTrack(raw); // residual is "" for a pure run ("l l l l" / "○ ○ ○")
		const text = stripMarkers(joinMd(s.lines));
		if (max > 0 && !residual) {
			// A standalone marker run ("l l l l l" / "○ ○ ○") is the Marks track (its length is the max).
			list.push({ type: "entry", slug: "marks", content: { title: null, text: "Marks" }, track: { max } });
		} else if (s.kind === "li" || max > 0) {
			const row = { type: "entry", content: { title: null, text } };
			if (text) row.slug = unlockSlug(text);
			if (max > 0) row.track = { max }; // a task checkbox is max 1; an embedded run keeps its count
			list.push(row);
		} else {
			list.push({ type: "entry", content: { title: null, text } });
		}
	}
	// Drop trailing non-tracked instruction paras that follow the task/Marks track (e.g. "When you make
	// the last mark, you unlock …") — they're informational, not unlock options.
	if (list.some((e) => e.track)) while (list.length && !list[list.length - 1].track) list.pop();
	front.unlock = { slug, list };
	return front;
}

/** Build a MAJOR back: "Mysteries of X" with all-caps mystery moves and a consequence track. Majors
 *  share the front's item (itemSameAsFront) and have no separate back item/description/resource. Each
 *  move (a `□ ALL-CAPS NAME` list item) and each consequence (a `□`-marked list item) continues
 *  through the following paras until the next list item / rule / heading. `unlockAt` is front-derived. */
function parseMajorBack(blocks, { slug, name, unlockAt }) {
	const back = { title: null, item: null, description: null, resource: null, itemSameAsFront: true, choices: null, moves: [], consequences: null, unlockAt: unlockAt ?? null };
	const abbr = toSlug((name || "").trim().split(/\s+/).pop() || "c") || "c"; // "Twisted Spear" → "spear"
	let section = null; // null | "moves" | "consequences"
	let cur = null;     // the move/consequence currently accreting following paras/bullets
	const flush = () => {
		if (!cur) return;
		const text = cur.text.replace(/\n{3,}/g, "\n\n").trim();
		if (cur.kind === "move") {
			const nm = titleCase(cur.name);
			const { moves: reqMoves, text: body } = parseRequires(text);
			const move = { id: toSlug(nm), name: nm, text: body };
			if (reqMoves) move.requirement = { moves: reqMoves };
			back.moves.push(move);
		} else {
			(back.consequences ??= { slug: "consequences", list: [] });
			const row = { type: "entry", slug: `${abbr}-c${back.consequences.list.length + 1}`, content: { title: null, text } };
			if (cur.max > 0) row.track = { max: cur.max };
			back.consequences.list.push(row);
		}
		cur = null;
	};
	const bullet = (it) => "\n- " + stripMarkers(joinMd(it)).replace(/^[ä••\-\s]+/, "");
	for (const b of blocks) {
		if (b.type === "heading" || b.type === "title") {
			const t = b.line.text.trim();
			if (/^moves$/i.test(t)) { flush(); section = "moves"; }
			else if (/^consequences$/i.test(t)) { flush(); section = "consequences"; }
			else if (/^(front|back)$/i.test(t) || /^appendix [cd]/i.test(t)) { flush(); section = null; } // side label / running header ends back content
			else if (!back.title) back.title = t;
			continue;
		}
		if (b.type === "rule") { flush(); continue; } // a rule separates moves / consequences
		if (b.type === "boxstart" || b.type === "boxend" || b.type === "table" || b.type === "statblock" || b.type === "image") continue;
		if (section === "moves") {
			if (b.type === "list") for (const it of b.items) {
				const head = majorMoveName(it[0]?.text || "");
				const isWord = /^[A-Z][a-z]+\./.test(stripMarkers(it[0]?.text || "")); // a "□ Seal." option
				if (markerKind(it[0]) === "square" && head.name) {        // a "□ ALL-CAPS NAME" move header
					flush();
					const tail = stripMarkers(joinMd(it.slice(1)));
					cur = { kind: "move", name: head.name, text: [head.rest, tail].filter(Boolean).join(" ") };
				} else if (markerKind(it[0]) === "square" && isWord) {
					// A "□ Word." option (ineffable-words' Seal/Purify/Gather/Empower) folds into the move as
					// an option — a rule separates it from the header, so re-attach to the last move once flushed.
					const line = "\n- " + stripMarkers(joinMd(it));
					if (cur) cur.text += line; else if (back.moves.length) back.moves[back.moves.length - 1].text += line;
				} else if (cur) cur.text += bullet(it);                   // a sub-bullet of the current move
			} else if (b.type === "para" && cur) cur.text += "\n\n" + stripMarkers(joinMd(b.lines));
		} else if (section === "consequences") {
			if (b.type === "list") for (const it of b.items) {
				// A consequence is a "□"-marked item; the box may follow stray leading circle/diamond glyphs
				// (layout noise, e.g. norubas' "○ ○ □ …"). Its track is the box count only — circles there
				// aren't a consequence track (those are resource/loyalty markers elsewhere).
				if (/^[○◯◇\s]*[□◻]/.test((it[0]?.text || "").trim())) {
					flush();
					cur = { kind: "consequence", max: (rawOf(it).match(/[□◻]/g) || []).length, text: stripMarkers(joinMd(it)) };
				} else if (cur) cur.text += bullet(it);
			} else if (b.type === "para" && cur) cur.text += "\n\n" + stripMarkers(joinMd(b.lines));
		}
	}
	flush();
	// The book titles every major back "Mysteries of the X", but the heading isn't reliably tagged as a
	// heading for a few cards (staff / redwood / ineffable extract without it) — derive it when the title
	// heading wasn't captured. Cards whose heading IS captured keep it verbatim (e.g. the possessive
	// "Mysteries of Noruba's Ice Sphere", which drops the "the").
	if (!back.title && name) back.title = `Mysteries of the ${name}`;
	return back;
}

/** Build the back side (the spell / mysteries) from its blocks. Stat blocks (followers) are handled
 *  by build-arcana via toFollowerDoc; here we collect moves/consequences/resource. */
export function parseBack(blocks, { slug, name, major, unlockAt } = {}) {
	if (major) return parseMajorBack(blocks, { slug, name, unlockAt });
	const back = { title: null, item: null, description: null, resource: null, moves: [], consequences: null, unlockAt: null };
	let section = null; // null | "moves" | "consequences"
	const descParas = [];
	for (const b of blocks) {
		if (b.type === "heading" || b.type === "title") {
			const t = b.line.text.trim();
			if (/^moves$/i.test(t)) section = "moves";
			else if (/^consequences$/i.test(t)) section = "consequences";
			else if (/^(front|back)$/i.test(t) || /^appendix [cd]/i.test(t)) { /* side label / running header */ }
			else if (!back.title) back.title = t; // first real heading = spell name / "Mysteries of X"
			continue;
		}
		if (b.type === "rule" || b.type === "boxstart" || b.type === "boxend" || b.type === "table" || b.type === "statblock") continue;
		// A leading tags line right under the spell title → the back item (mirrors the front).
		if (b.type === "para" && section === null && !back.item && !descParas.length) {
			const t = joinMd(b.lines);
			if (b.tags || /^,/.test(t.replace(/^[◇○□◻\s]+/, ""))) { back.item = parseItemLine(t, { name: back.title }); continue; }
		}
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
