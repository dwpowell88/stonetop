// Book I (the Stonetop core book) plan + page-splitting helpers. Unlike Book II — a flat
// gazetteer of short articles — Book I is 17 large chapters with nested subsections, so a chapter
// becomes one JournalEntry and each outline subsection becomes a JournalEntryPage. Subsections
// frequently start mid-page; sections are separated by locating the subsection heading on its
// start page and splitting that page's content at the heading, column-aware (all Book I pages are
// two ~160pt columns, reading order left column then right).
import { isAvara } from "./fonts.js";
import { clusterColumns } from "./layout.js";

// Top-level outline entries that aren't book content.
const SKIP = new Set(["Contents", "INDEX"]);
// The front-matter sections arrive as childless top-level entries; fold them into the Welcome
// chapter instead of making each a chapter of its own.
const FRONT_MATTER = new Set(["Expectations", "The setting", "Why play?"]);

// Sections the vendor's 2-up build forgot to bookmark (its outline has one entry fewer than the
// 1-up's). The heading is set on the page as normal — only the outline entry is missing — so
// re-insert it after its predecessor and let `findCut` locate it from there. Without this the
// section has no start page of its own and silently merges into the one before it.
const MISSING_SECTIONS = [{ after: "Updating followers", title: "Losing followers" }];

/** Re-insert any MISSING_SECTIONS the outline doesn't already carry (a no-op on the 1-up build). */
export function patchOutline(entries) {
	const out = [...entries];
	for (const { after, title } of MISSING_SECTIONS) {
		if (out.some((e) => e.title === title)) continue;
		const i = out.findIndex((e) => e.title === after);
		if (i < 0) continue;
		out.splice(i + 1, 0, { title, pdfPage: out[i].pdfPage, depth: out[i].depth });
	}
	return out;
}

/**
 * Group the parsed outline into chapters with ordered section lists. Every outline entry of depth
 * ≥2 becomes a section of its chapter; each chapter also opens with a lead section (the chapter
 * opener text before the first subsection) carrying the chapter's own title. Returns
 * `[{title, startPage, endPage, sections: [{title, startPage, lead?}]}]`.
 */
export function chapterPlan(entries, totalPages) {
	const chapters = [];
	const boundaries = []; // start pages of everything that ends the previous chapter
	for (const e of patchOutline(entries)) {
		if (e.depth === 1) {
			if (SKIP.has(e.title)) { boundaries.push(e.pdfPage); continue; }
			if (FRONT_MATTER.has(e.title) && chapters.length) {
				chapters[chapters.length - 1].sections.push({ title: e.title, startPage: e.pdfPage });
				continue;
			}
			boundaries.push(e.pdfPage);
			chapters.push({ title: e.title, startPage: e.pdfPage, sections: [{ title: e.title, startPage: e.pdfPage, lead: true }] });
		} else if (chapters.length) {
			chapters[chapters.length - 1].sections.push({ title: e.title, startPage: e.pdfPage });
		}
	}
	for (const c of chapters) {
		const next = boundaries.find((b) => b > c.startPage);
		c.endPage = next ? next - 1 : totalPages;
	}
	return chapters;
}

// ─── heading location & page splitting ────────────────────────────────────────

const norm = (s) => s.toLowerCase().replace(/[’'&.,:()/\-–—]/g, " ").replace(/\s+/g, " ").trim();

// Furniture — the printed page number in the footer and the running header — is layout chrome,
// not content: it must survive a split on BOTH sides (orderColumns drops the header and harvests
// the page number, whichever section ends up holding it).
//
// The running head is set at 10pt. The insert cards ("Followers", "Inventory for", "Player's
// Agenda") open with a 9pt Avara heading in that same top band and carry no running head at all,
// so the lower bound is what keeps them content — without it a section headed that way is
// invisible to findCut and silently merges into its predecessor.
const isFurniture = (l, pageH) =>
	(isAvara(l.font) && l.size <= 11 && l.bbox[1] > pageH - 30 && /^\d+$/.test(l.text.trim()))
	|| (isAvara(l.font) && l.size >= 10 && l.size < 16 && l.bbox[1] < 70);

/** Cluster content-line left edges into column bases (same >150pt gap rule as orderColumns).
 *  `pageW` opts a 2-up spread into per-printed-page clustering — see `clusterColumns`. */
export function columnBases(lines, pageH, pageW = 0) {
	const xs = lines.filter((l) => !isFurniture(l, pageH)).map((l) => l.bbox[0]);
	return clusterColumns(xs, pageW, pageH);
}

const isBold = (f) => /bold|black|heavy/i.test(f);

/**
 * Does this line carry the section's heading, and how well? Returns 0 for a heading that *is* the
 * title, 1 for one that merely starts with it (a heading wrapped over two lines), -1 for no match.
 * Rank matters: "NPCs" would otherwise cut at the "NPCs in play" heading further down its page,
 * and the two sections would split at the same line — leaving the first one empty.
 *
 * Three ways a section announces itself in Book I:
 *
 *  - a display heading — Avara, set larger than body text (the common case, and the one that wraps);
 *  - a run-in lead — the insert cards ("Animal Companion  Ranger, you are accompanied by…") set the
 *    name in Avara bold and continue the body in Caslon on the same line, so the *line's* font is
 *    the body's. Only the first span is the heading, and it must be the whole title;
 *  - a sidebar head — the boxed special moves (BURN BRIGHTLY, DEATH'S DOOR) are Caslon bold small
 *    caps at body size, so nothing but a bold line that is *exactly* the title may match.
 */
function headingRank(l, t, pageH) {
	if (isFurniture(l, pageH)) return -1;
	const n = norm(l.text);
	if (!n) return -1;
	const exact = n === t;
	const wrapped = (n.length >= 4 && t.startsWith(n)) || (t.length >= 4 && n.startsWith(t));
	if (!exact && !wrapped) return -1;
	if (isAvara(l.font) && l.size >= 10) return exact ? 0 : 1;
	const lead = l.spans?.[0];
	if (lead && isAvara(lead.font) && norm(lead.text) === t) return 0;
	return exact && isBold(l.font) ? 0 : -1;
}

/**
 * Find the section heading on its start page (see `isHeading` for what counts as one). Returns
 * `{x, y, col, top, bases}` (`top` when nothing but furniture sits above it, i.e. the section
 * really starts at the page top) or null.
 *
 * `bases` are the page's column bases as measured *here*, on the whole page, and `clipPage` splits
 * with them rather than re-measuring: a page shared by three sections is clipped twice, and the
 * second clip would otherwise re-cluster the already-clipped lines, renumbering the columns out
 * from under `col`.
 */
export function findCut(pg, title) {
	const t = norm(title);
	if (!t) return null;
	const ranked = pg.lines.map((l) => [l, headingRank(l, t, pg.height)]).filter(([, r]) => r >= 0);
	if (!ranked.length) return null;
	const best = Math.min(...ranked.map(([, r]) => r));
	const hit = ranked.find(([, r]) => r === best)[0];
	const bases = columnBases(pg.lines, pg.height, pg.width);
	const colOf = (x) => { let i = 0; while (i + 1 < bases.length && bases[i + 1] <= x + 8) i++; return i; };
	const cut = { x: hit.bbox[0], y: hit.bbox[1], col: colOf(hit.bbox[0]), bases };
	// At the top: no content line reads before it (earlier column, or same column above it).
	cut.top = !pg.lines.some((l) =>
		!isFurniture(l, pg.height) && l !== hit && l.text.trim()
		&& (colOf(l.bbox[0]) < cut.col || (colOf(l.bbox[0]) === cut.col && l.bbox[1] < cut.y - 2)));
	return cut;
}

/** A 2-up page is a landscape spread of two portrait printed pages (the 1-up builds are portrait). */
const isSpread = (pg) => pg.width > pg.height;

/**
 * Split one loaded page at a cut. `side: "after"` keeps the cut line and everything reading after
 * it; `"before"` keeps everything reading before it. Returns fresh `{pg, rules, images}` clones —
 * the caller caches loaded pages, so nothing here may mutate them.
 *
 * Furniture survives the split, but only on the half it belongs to: a 2-up spread carries the
 * footer page number of *both* printed pages, and a section that covers one half of it must claim
 * only that half's number, or every section sharing a spread reports a range a page too wide.
 */
export function clipPage({ pg, rules, images }, cut, side) {
	const bases = cut.bases ?? columnBases(pg.lines, pg.height, pg.width);
	const colOf = (x) => { let i = 0; while (i + 1 < bases.length && bases[i + 1] <= x + 8) i++; return i; };
	const after = (x, y) => colOf(x) > cut.col || (colOf(x) === cut.col && y >= cut.y - 2);
	const keep = side === "after" ? after : (x, y) => !after(x, y);
	const mid = pg.width / 2;
	const half = (x) => (x < mid ? 0 : 1);
	const kept = new Set(pg.lines
		.filter((l) => !isFurniture(l, pg.height) && l.text.trim() && keep(l.bbox[0], l.bbox[1]))
		.map((l) => half(l.bbox[0])));
	const keepFurniture = (l) => !isSpread(pg) || kept.has(half(l.bbox[0]));
	return {
		pg: { ...pg, lines: pg.lines.filter((l) => (isFurniture(l, pg.height) ? keepFurniture(l) : keep(l.bbox[0], l.bbox[1]))) },
		rules: rules.filter((r) => keep(r.x, r.y)),
		images: images.filter((im) => keep(im.x + (im.w || 0) / 2, im.y)),
	};
}
