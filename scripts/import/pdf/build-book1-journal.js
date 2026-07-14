// Build the `book-of-stonetop` JournalEntry pack source (the private stonetop-companion module)
// from Book I, the Stonetop core book. One JournalEntry per chapter, one JournalEntryPage per
// outline subsection (chapters are far too large for single pages — see book1.js for the plan and
// the mid-page section splitting). Run from system/:
//
//   BOOK_PDF=../books/Book_I_Stonetop.pdf node scripts/import/pdf/build-book1-journal.js
//
// Illustrations are content-addressed into the gitignored stonetop-art/book-i/ store (resolving to
// Foundry's Data/stonetop-art/book-i/); the chapter chrome (chain band — trade dress) is committed
// into the module's assets. Deterministic ids throughout, so rebuilding never breaks @UUID links.
import { execFileSync } from "child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readdirSync } from "fs";
import os from "os";
import path from "path";
import { loadOutline } from "./outline.js";
import { chapterPlan, findCut, clipPage } from "./book1.js";
import { loadPage } from "./load.js";
import { extractArticle } from "./layout.js";
import { renderHtml } from "./render-html.js";
import { buildPageMap, linkPageRefs } from "./crossref.js";
import { loadArcanaIndex, linkArcana } from "./arcana.js";
import { extractChrome } from "./images.js";
import { formatPageRange } from "./pages.js";
import { deterministicId, documentKey } from "../ids.js";
import { toSlug } from "../../../src/utils/slug.js";

const PDF = process.env.BOOK_PDF ?? "../books/Book_I_Stonetop.pdf";
const PACKAGE = "stonetop-companion";
const PACK = "book-of-stonetop";
const MODULE_DIR = process.env.MODULE_DIR ?? "../module/stonetop-companion";
const OUT = `${MODULE_DIR}/packs/src/${PACK}`;
const DECOR_DIR = `${MODULE_DIR}/assets/decor`;          // committed chrome (chain band)
const DECOR_URL = `modules/${PACKAGE}/assets/decor`;
const SHARED_DIR = "stonetop-art/book-i";                // gitignored illustration store
const SHARED_URL = "stonetop-art/book-i";

const entryId = (chapterSlug) => deterministicId(PACK, chapterSlug);
const pageId = (key) => deterministicId(PACK, key);
const pageUuid = (key) => {
	const [chapterSlug] = key.split("/");
	return `Compendium.${PACKAGE}.${PACK}.JournalEntry.${entryId(chapterSlug)}.JournalEntryPage.${pageId(key)}`;
};

function totalPages() {
	const out = execFileSync("mutool", ["info", PDF], { encoding: "utf8" });
	return Number((out.match(/Pages:\s*(\d+)/) || [])[1] || 614);
}

const plan = chapterPlan(loadOutline(PDF), totalPages());
const wanted = process.argv.slice(2);
const build = wanted.length ? plan.filter((c) => wanted.some((w) => w.toLowerCase() === c.title.toLowerCase())) : plan;
if (wanted.length && build.length !== wanted.length)
	for (const w of wanted) if (!plan.some((c) => c.title.toLowerCase() === w.toLowerCase())) console.warn(`! no chapter titled ${JSON.stringify(w)}`);

mkdirSync(OUT, { recursive: true });
if (!wanted.length) {
	for (const f of readdirSync(OUT).filter((n) => n.endsWith(".json"))) rmSync(path.join(OUT, f)); // full rebuild
	rmSync(SHARED_DIR, { recursive: true, force: true });  // clear the store so dedup starts clean
}
mkdirSync(SHARED_DIR, { recursive: true });
const chrome = extractChrome(PDF, DECOR_DIR);
const chromeChain = chrome.chain ? `${DECOR_URL}/${path.basename(chrome.chain)}` : null;

// Every page is loaded exactly once (sections share boundary pages; a second extractPageArt pass
// per page would be wasted work). Splits clone — cached pages are never mutated.
const dedup = new Map();
const scratch = mkdtempSync(path.join(os.tmpdir(), "book1-img-"));
const pageCache = new Map();
const getPage = (p) => {
	if (!pageCache.has(p)) pageCache.set(p, loadPage(PDF, p, {
		imgDir: scratch,
		imgPrefix: `p${p}`,
		dedup: { index: dedup, dir: SHARED_DIR },
		mapFile: (f) => `${SHARED_URL}/${path.relative(SHARED_DIR, f)}`,
		markers: { flattenedCurves: true },
	}));
	return pageCache.get(p);
};

/**
 * Resolve a chapter's sections into cut points: `{sec, page, cut|null, merged[]}`. A section whose
 * heading can't be found on a start page it shares with its predecessor is merged into that
 * predecessor (typical for a parent outline node whose first child starts immediately).
 */
function resolveCuts(chapter) {
	const cuts = [];
	for (const sec of chapter.sections) {
		if (!cuts.length) {
			// Chapter openers are rectos, so on a 2-up spread the facing page belongs to whatever came
			// before — front matter, or the previous chapter's last page. Clip the lead at the chapter
			// title whenever anything reads before it; on a 1-up (and on the openers whose facing page
			// is a full-bleed plate, which carries no text) the title is already at the page top.
			const cut = findCut(getPage(sec.startPage).pg, sec.title);
			cuts.push({ sec, page: sec.startPage, cut: cut && !cut.top ? cut : null, merged: [] });
			continue;
		}
		const prev = cuts[cuts.length - 1];
		const cut = findCut(getPage(sec.startPage).pg, sec.title);
		if (cut && !cut.top) cuts.push({ sec, page: sec.startPage, cut, merged: [] });
		else if (sec.startPage > prev.page || (cut && cut.top && sec.startPage > prev.page)) cuts.push({ sec, page: sec.startPage, cut: null, merged: [] });
		else if (cut && cut.top && sec.startPage === prev.page && prev.cut) cuts.push({ sec, page: sec.startPage, cut, merged: [] });
		else prev.merged.push(sec.title); // same page, no locatable boundary — one journal page
	}
	return cuts;
}

/** Assemble a section's loaded pages, clipping the boundary pages at the cuts. */
function sectionPages(start, next, chapterEnd) {
	const firstPage = start.page;
	const lastPage = next ? (next.cut ? next.page : next.page - 1) : chapterEnd;
	const pages = [], pageRules = [], pageImages = [];
	for (let p = firstPage; p <= lastPage; p++) {
		let loaded = getPage(p);
		if (p === start.page && start.cut) loaded = clipPage(loaded, start.cut, "after");
		if (next && p === next.page && next.cut) loaded = clipPage(loaded, next.cut, "before");
		pages.push(loaded.pg); pageRules.push(loaded.rules); pageImages.push(loaded.images);
	}
	return { pages, pageRules, pageImages };
}

// Pass 1 — extract + render every section body; harvest printed page numbers for the cross-ref map.
const flags = [];
const builtChapters = [];
for (const chapter of build) {
	const chapterSlug = toSlug(chapter.title);
	const cuts = resolveCuts(chapter);
	const sections = [];
	const usedSlugs = new Set();
	for (let i = 0; i < cuts.length; i++) {
		const start = cuts[i], next = cuts[i + 1] ?? null;
		let slug = toSlug(start.sec.lead ? "overview" : start.sec.title);
		for (let n = 2; usedSlugs.has(slug); n++) slug = `${toSlug(start.sec.title)}-${n}`;
		usedSlugs.add(slug);
		const key = `${chapterSlug}/${slug}`;
		try {
			const { pages, pageRules, pageImages } = sectionPages(start, next, chapter.endPage);
			const art = extractArticle(pages, { title: start.sec.title, pageRules, pageImages, splitSpread: true });
			const body = renderHtml(art, { chrome: { chain: start.sec.lead ? chromeChain : null } });
			sections.push({ key, slug, title: start.sec.title, merged: start.merged, body, pageNumbers: art.pageNumbers, page: formatPageRange(art.pageNumbers) });
		} catch (e) { flags.push(`! ${chapter.title} / ${start.sec.title}: failed — ${e.message}`); }
	}
	builtChapters.push({ chapter, chapterSlug, sections });
}
rmSync(scratch, { recursive: true, force: true });

// Pass 2 — printed-page cross-refs → journal-page links, arcana names → arcana items, then write.
const pageMap = buildPageMap(builtChapters.flatMap((c) => c.sections.map((s) => ({ slug: s.key, pageNumbers: s.pageNumbers }))));
const arcanaIndex = loadArcanaIndex();

let entries = 0, pagesWritten = 0, links = 0, arcanaLinks = 0;
for (const [ci, { chapter, chapterSlug, sections }] of builtChapters.entries()) {
	// Compendium listings sort alphabetically, so the display name carries the chapter's book-order
	// number ("00 Welcome to Stonetop" … "18 Mediography"). Ids/slugs stay derived from the bare
	// title — numbering must never break existing @UUID links.
	const chapterNo = String(plan.indexOf(chapter)).padStart(2, "0");
	const eid = entryId(chapterSlug);
	const pages = sections.map((s, si) => {
		const pageLinked = linkPageRefs(s.body, pageMap, { selfSlug: s.key, uuid: pageUuid });
		const arc = linkArcana(pageLinked.html, arcanaIndex);
		links += pageLinked.linked;
		arcanaLinks += arc.linked;
		const ref = s.page ? `<p class="wonder-pageref">Stonetop, Book I — p.${s.page}</p>` : "";
		const pid = pageId(s.key);
		return {
			_id: pid,
			_key: `!journal.pages!${eid}.${pid}`,
			name: s.title,
			type: "text",
			title: { show: false, level: 1 },
			image: {},
			src: null,
			text: { format: 1, content: `<div class="stonetop-wonder">${ref}${arc.html}</div>`, markdown: undefined },
			video: { controls: true, volume: 0.5 },
			system: {},
			sort: (si + 1) * 100000,
			ownership: { default: -1 },
			flags: { stonetop: { bookPages: s.page, slug: s.key, merged: s.merged.length ? s.merged : undefined } },
		};
	});
	const entry = {
		_id: eid,
		_key: documentKey("JournalEntry", eid),
		name: `${chapterNo} ${chapter.title}`,
		pages,
		folder: null,
		sort: (ci + 1) * 100000,
		ownership: { default: 0 },
		flags: { stonetop: { slug: chapterSlug } },
	};
	writeFileSync(path.join(OUT, `${chapterSlug}.json`), JSON.stringify(entry, null, 2) + "\n");
	entries++; pagesWritten += pages.length;
}

console.log(`\nwrote ${entries} journal entries (${pagesWritten} pages) to ${OUT}/`
	+ ` (${links} page-ref links, ${arcanaLinks} arcana links, ${dedup.size} distinct images in ${SHARED_DIR})`);
if (flags.length) console.log(`\n${flags.length} note(s) for review:\n` + flags.join("\n"));
