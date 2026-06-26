// Build the arcana pack source from Book II Appendix C (Minor) + D (Major).
//   node scripts/import/pdf/build-arcana.js          # report only -> helper/arcanum-manual-review.md
//   node scripts/import/pdf/build-arcana.js --write   # also overwrite packs/src/arcana/**.json
//
// The book lays each arcanum out as a two-sided card: a FRONT (name, item, description, unlock) that
// ends with a "front" side-label, and a BACK (spell / mysteries) that ends with a "back" side-label.
// We split the flattened block stream on those labels, match fronts to arcana by name and backs by
// their existing `back.title` (we regenerate a known set), preserve each `_id`/`folder` by slug, and
// report divergences from the hand-authored JSON.
import os from "os"; import path from "path";
import { mkdtempSync, rmSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { execFileSync } from "child_process";
import { loadOutline, arcanaAppendixRanges } from "./outline.js";
import { loadArticlePages } from "./load.js";
import { extractArticle } from "./layout.js";
import { parseFront, parseBack } from "./arcana-parse.js";

const PDF = process.env.BOOK_PDF ?? "helper/Book_II_-_The_Wider_World_and_Other_Wonders.pdf";
const WRITE = process.argv.includes("--write");
const REVIEW = "helper/arcanum-manual-review.md";
const norm = (s) => (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
const totalPages = () => Number((execFileSync("mutool", ["info", PDF], { encoding: "utf8" }).match(/Pages:\s*(\d+)/) || [])[1] || 302);
const lineText = (b) => b.type === "heading" || b.type === "title" ? b.line.text : (b.lines?.[0]?.text ?? "");
const isLabel = (b, re) => (b.type === "heading" || b.type === "title") && re.test(b.line.text.trim());

// Index existing arcana: slug -> record; name -> rec; backTitle -> rec.
const bySlug = new Map(), byName = new Map(), byBackTitle = new Map();
for (const tier of ["minor", "major"]) {
	for (const f of readdirSync(`packs/src/arcana/${tier}`).filter((n) => n.endsWith(".json"))) {
		const doc = JSON.parse(readFileSync(`packs/src/arcana/${tier}/${f}`, "utf8"));
		const rec = { slug: doc.system.slug, tier, doc, file: `packs/src/arcana/${tier}/${f}` };
		bySlug.set(rec.slug, rec);
		byName.set(norm(doc.name), rec);
		if (doc.system.back?.title) byBackTitle.set(norm(doc.system.back.title), rec);
	}
}

// Match a heading (possibly wrapped across 1–2 following blocks) against a name→record map.
function matchHeading(blocks, i, map) {
	const b = blocks[i];
	if (b.type !== "heading" && b.type !== "title") return null;
	let key = norm(lineText(b));
	for (let k = 0; k <= 2; k++) { if (map.has(key)) return map.get(key); key += norm(lineText(blocks[i + 1 + k] || {})); }
	return null;
}

// Segment a block stream into per-record chunks anchored on headings that match `map`, each bounded
// to the side-label `endRe` (so a chunk stops at its "front"/"back" label and trailing neighbour
// content from another column is excluded). Returns [{ rec, blocks }].
function segmentBy(blocks, map, endRe) {
	const out = []; let cur = null;
	for (let i = 0; i < blocks.length; i++) {
		const rec = matchHeading(blocks, i, map);
		if (rec && (!cur || cur.rec.slug !== rec.slug)) { if (cur) out.push(cur); cur = { rec, blocks: [], done: false }; }
		if (!cur || cur.done) continue;
		cur.blocks.push(blocks[i]);
		if (isLabel(blocks[i], endRe)) cur.done = true;
	}
	if (cur) out.push(cur);
	return out;
}

// ── divergence ──────────────────────────────────────────────────────────────
const txt = (s) => String(s ?? "").toLowerCase().replace(/[*_`#]/g, "").replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/…/g, "...").replace(/\s+/g, " ").trim();
const sim = (a, b) => { a = txt(a); b = txt(b); if (!a && !b) return 1; if (!a || !b) return 0; const A = new Set(a.split(" ")), B = new Set(b.split(" ")); let n = 0; for (const w of A) if (B.has(w)) n++; return (2 * n) / (A.size + B.size); };
const rows = (g) => g?.list?.length ?? 0;
const tracks = (g) => (g?.list || []).map((r) => r.track?.max ?? 0).join(",");

function diverge(parsed, doc) {
	const fl = [], ef = doc.system.front || {}, pf = parsed.front || {}, eb = doc.system.back || {}, pb = parsed.back || {};
	if (rows(pf.unlock) !== rows(ef.unlock)) fl.push(`front.unlock rows ${rows(pf.unlock)} vs ${rows(ef.unlock)}`);
	if (tracks(pf.unlock) !== tracks(ef.unlock)) fl.push(`front.unlock tracks [${tracks(pf.unlock)}] vs [${tracks(ef.unlock)}]`);
	if (sim(pf.description, ef.description) < 0.6) fl.push(`front.description low sim (${sim(pf.description, ef.description).toFixed(2)})`);
	if ((pf.item ? 1 : 0) !== (ef.item ? 1 : 0)) fl.push(`front.item ${!!pf.item} vs ${!!ef.item}`);
	if (!!parsed.back !== !!doc.system.back) fl.push(`back present ${!!parsed.back} vs ${!!doc.system.back}`);
	if (doc.system.back) {
		if (sim(pb.title, eb.title) < 0.6) fl.push(`back.title "${pb.title}" vs "${eb.title}"`);
		if ((pb.moves?.length ?? 0) !== (eb.moves?.length ?? 0)) fl.push(`back.moves ${pb.moves?.length ?? 0} vs ${eb.moves?.length ?? 0}`);
		if (rows(pb.consequences) !== rows(eb.consequences)) fl.push(`back.consequences ${rows(pb.consequences)} vs ${rows(eb.consequences)}`);
	}
	return fl;
}

// ── run ───────────────────────────────────────────────────────────────────────
const ranges = arcanaAppendixRanges(loadOutline(PDF), totalPages());
const parsedFront = new Map(); // slug -> front
const parsedBack = new Map();  // slug -> back
const review = [`# Arcanum parse — manual review`, ``];

for (const range of ranges) {
	const tmp = mkdtempSync(path.join(os.tmpdir(), "arc-"));
	const { pages, pageRules, pageImages } = loadArticlePages(PDF, range, { imgDir: tmp, imgPrefix: "arc" });
	const art = extractArticle(pages, { title: range.title, pageRules, pageImages });
	rmSync(tmp, { recursive: true, force: true });
	const blocks = [];
	for (const s of art.sections) for (const c of [...s.left, ...s.right]) blocks.push(...c.blocks);

	// Fronts: anchored on arcanum names, bounded at the "front" label.
	for (const { rec, blocks: bl } of segmentBy(blocks, byName, /^front$/i))
		if (!parsedFront.has(rec.slug)) parsedFront.set(rec.slug, parseFront(bl, { name: rec.doc.name, slug: rec.slug }));
	// Backs: anchored on the existing back.title (the spell / "Mysteries of X"), bounded at "back".
	for (const { rec, blocks: bl } of segmentBy(blocks, byBackTitle, /^back$/i))
		if (!parsedBack.has(rec.slug)) parsedBack.set(rec.slug, parseBack(bl, { slug: rec.slug }));
}

const reviewBody = [];
let parsedCount = 0, flagged = 0;
for (const rec of bySlug.values()) {
	const front = parsedFront.get(rec.slug);
	if (!front) continue;
	parsedCount++;
	const parsed = { major: rec.tier === "major", front, back: parsedBack.get(rec.slug) ?? null };
	const fl = diverge(parsed, rec.doc);
	if (fl.length) { flagged++; reviewBody.push(`## ${rec.doc.name} \`${rec.slug}\` (${rec.tier})`, ...fl.map((f) => `- ${f}`), ``); }

	if (WRITE) {
		const sys = { slug: rec.slug, front, back: parsed.back };
		if (parsed.major) sys.major = true;
		const out = { _id: rec.doc._id, _key: rec.doc._key, name: rec.doc.name, type: "arcanum",
			...(rec.doc.img ? { img: rec.doc.img } : {}), system: sys, flags: {}, folder: rec.doc.folder };
		writeFileSync(rec.file, JSON.stringify(out, null, "\t") + "\n");
	}
}

const missing = [...bySlug.keys()].filter((s) => !parsedFront.has(s));
review.push(`Parsed ${parsedCount}/${bySlug.size} fronts, ${parsedBack.size} backs; ${flagged} flagged${missing.length ? `; NO FRONT: ${missing.join(", ")}` : ""}.`, ``, ...reviewBody);
mkdirSync(path.dirname(REVIEW), { recursive: true });
writeFileSync(REVIEW, review.join("\n"));
console.log(`fronts ${parsedCount}/${bySlug.size}, backs ${parsedBack.size}; ${flagged} flagged${missing.length ? `; ${missing.length} missing front` : ""}. -> ${REVIEW}${WRITE ? "  (WROTE JSON)" : "  (report only)"}`);
