// Book I (the Stonetop core book) plan + page-splitting helpers. Unlike Book II — a flat
// gazetteer of short articles — Book I is 17 large chapters with nested subsections, so a chapter
// becomes one JournalEntry and each outline subsection becomes a JournalEntryPage. Subsections
// frequently start mid-page; sections are separated by locating the subsection heading on its
// start page and splitting that page's content at the heading, column-aware (all Book I pages are
// two ~160pt columns, reading order left column then right).
import { isAvara } from "./fonts.js";

// Top-level outline entries that aren't book content.
const SKIP = new Set(["Contents", "INDEX"]);
// The front-matter sections arrive as childless top-level entries; fold them into the Welcome
// chapter instead of making each a chapter of its own.
const FRONT_MATTER = new Set(["Expectations", "The setting", "Why play?"]);

/**
 * Group the parsed outline into chapters with ordered section lists. Every outline entry of depth
 * ≥2 becomes a section of its chapter; each chapter also opens with a lead section (the chapter
 * opener text before the first subsection) carrying the chapter's own title. Returns
 * `[{title, startPage, endPage, sections: [{title, startPage, lead?}]}]`.
 */
export function chapterPlan(entries, totalPages) {
	const chapters = [];
	const boundaries = []; // start pages of everything that ends the previous chapter
	for (const e of entries) {
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
const isFurniture = (l, pageH) =>
	(isAvara(l.font) && l.size <= 11 && l.bbox[1] > pageH - 30 && /^\d+$/.test(l.text.trim()))
	|| (isAvara(l.font) && l.size < 16 && l.bbox[1] < 70);

/** Cluster content-line left edges into column bases (same >150pt gap rule as orderColumns). */
export function columnBases(lines, pageH) {
	const xs = lines.filter((l) => !isFurniture(l, pageH)).map((l) => l.bbox[0]).sort((a, b) => a - b);
	const bases = [];
	for (const x of xs) if (!bases.length || x - bases[bases.length - 1] > 150) bases.push(x);
	return bases;
}

/**
 * Find the section heading on its start page: an Avara line ≥10pt whose normalized text matches
 * the outline title (headings may wrap — prefix matches count). Returns `{x, y, top}` (`top` when
 * nothing but furniture sits above it, i.e. the section really starts at the page top) or null.
 */
export function findCut(pg, title) {
	const t = norm(title);
	if (!t) return null;
	const hit = pg.lines.find((l) => {
		if (!isAvara(l.font) || l.size < 10 || isFurniture(l, pg.height)) return false;
		const n = norm(l.text);
		return n === t || (n.length >= 4 && t.startsWith(n)) || (t.length >= 4 && n.startsWith(t));
	});
	if (!hit) return null;
	const bases = columnBases(pg.lines, pg.height);
	const colOf = (x) => { let i = 0; while (i + 1 < bases.length && bases[i + 1] <= x + 8) i++; return i; };
	const cut = { x: hit.bbox[0], y: hit.bbox[1], col: colOf(hit.bbox[0]) };
	// At the top: no content line reads before it (earlier column, or same column above it).
	cut.top = !pg.lines.some((l) =>
		!isFurniture(l, pg.height) && l !== hit && l.text.trim()
		&& (colOf(l.bbox[0]) < cut.col || (colOf(l.bbox[0]) === cut.col && l.bbox[1] < cut.y - 2)));
	return cut;
}

/**
 * Split one loaded page at a cut. `side: "after"` keeps the cut line and everything reading after
 * it; `"before"` keeps everything reading before it. Furniture stays on both sides. Returns fresh
 * `{pg, rules, images}` clones — the caller caches loaded pages, so nothing here may mutate them.
 */
export function clipPage({ pg, rules, images }, cut, side) {
	const bases = columnBases(pg.lines, pg.height);
	const colOf = (x) => { let i = 0; while (i + 1 < bases.length && bases[i + 1] <= x + 8) i++; return i; };
	const after = (x, y) => colOf(x) > cut.col || (colOf(x) === cut.col && y >= cut.y - 2);
	const keep = side === "after" ? after : (x, y) => !after(x, y);
	return {
		pg: { ...pg, lines: pg.lines.filter((l) => isFurniture(l, pg.height) || keep(l.bbox[0], l.bbox[1])) },
		rules: rules.filter((r) => keep(r.x, r.y)),
		images: images.filter((im) => keep(im.x + (im.w || 0) / 2, im.y)),
	};
}
