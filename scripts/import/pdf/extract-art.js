// Bring-your-own-book art extractor. Regenerates the copyrighted Book II *wonders* illustrations
// into the gitignored stonetop-art/wonders/<hash>.png store, named to match the compendium
// references, from a Book II PDF you own. Trade-dress marker glyphs are (re)written to the
// committed assets/content/wonders/markers/. Nothing is committed — see stonetop-art/README.md.
//
// Usage: npm run extract-art -- /path/to/Book_II.pdf      (or set BOOK_PDF; defaults to helper/)
//
// Arcana, steading and playbook art are NOT produced here (arcana was made with a separate tool;
// steading/playbook come from the core book) — supply those manually.
import { mkdirSync, mkdtempSync, rmSync, existsSync, readFileSync, readdirSync } from "fs";
import os from "os";
import path from "path";
import { loadOutline, articleRanges } from "./outline.js";
import { loadArticlePages } from "./load.js";
import { extractChrome, extractSwirls } from "./images.js";
import { execFileSync } from "child_process";
import { toSlug } from "../../../src/utils/slug.js";

const PDF = process.argv[2] ?? process.env.BOOK_PDF ?? "helper/Book_II_-_The_Wider_World_and_Other_Wonders.pdf";
if (!existsSync(PDF)) {
	console.error(`! PDF not found: ${PDF}\n  Usage: npm run extract-art -- /path/to/Book_II.pdf`);
	process.exit(1);
}

const ASSET_DIR = "assets/content/wonders";
const DECOR_DIR = `${ASSET_DIR}/decor`;            // committed chrome (chain, rule)
const MARKERS_DIR = `${ASSET_DIR}/markers`;        // committed trade-dress marker glyphs
const UI_DECOR_DIR = "assets/ui/decor";            // committed swirl bullets
const SHARED_DIR = "stonetop-art/wonders";         // gitignored illustration store (external root)
const MARKERS = JSON.parse(readFileSync("scripts/import/pdf/trade-dress.json", "utf8")).markers;

function totalPages() {
	const out = execFileSync("mutool", ["info", PDF], { encoding: "utf8" });
	return Number((out.match(/Pages:\s*(\d+)/) || [])[1] || 302);
}

mkdirSync(MARKERS_DIR, { recursive: true });
rmSync(SHARED_DIR, { recursive: true, force: true });   // start dedup clean
mkdirSync(SHARED_DIR, { recursive: true });

// Shared chrome (same on every page).
extractChrome(PDF, DECOR_DIR);
extractSwirls(PDF, UI_DECOR_DIR);

const ranges = articleRanges(loadOutline(PDF), totalPages());
const dedup = new Map();
const scratch = mkdtempSync(path.join(os.tmpdir(), "extract-art-"));
let failed = 0;
for (const r of ranges) {
	const slug = toSlug(r.title);
	try {
		loadArticlePages(PDF, r, {
			imgDir: scratch,
			imgPrefix: slug,
			dedup: { index: dedup, dir: SHARED_DIR, markers: { dir: MARKERS_DIR, map: MARKERS } },
		});
	} catch (e) { failed++; console.warn(`! ${r.title}: ${e.message}`); }
}
rmSync(scratch, { recursive: true, force: true });

const wonders = existsSync(SHARED_DIR) ? readdirSync(SHARED_DIR).filter((f) => f.endsWith(".png")).length : 0;
console.log(`\nextracted ${wonders} wonders illustrations -> ${SHARED_DIR}/ (${dedup.size} distinct images across ${ranges.length - failed}/${ranges.length} articles)`);
console.log(`marker glyphs -> ${MARKERS_DIR}/  (trade dress, committed)`);
console.log(`\nNote: arcana, steading and playbook art are not produced by this tool — supply them manually in stonetop-art/. See stonetop-art/README.md.`);
