// Extract the artifact stat blocks embedded in the Wider World articles into arcanum items.
//
//   node scripts/import/build-artifacts.js
//
// Reads the wider-world-and-other-wonders pack SOURCE (the already-rendered article HTML), so it
// needs no PDF tooling and can be rerun after any pack regeneration. Each artifact block is an
// <h3> title followed by a `<p class="artifact-tags">` tag line and body paragraphs; the same
// markup also carries spirit/follower stat blocks, which are filtered out by their tag lines
// (Solitary/Group/Horde/spirit/Instinct — those are NPCs, not items).
//
// Output: packs/src/arcana/artifacts/<slug>.json — arcanum cards following the pack's existing
// convention: the front is the object as found (physical description, no unlock section — the
// sheet renders it as optional), the back is the revealed item with its powers. The split is at
// the first "When you …" move paragraph; move text stays inside the back description as
// bold-italic markdown, matching how existing arcana render it. Ids are deterministic, so
// regeneration never breaks links. TODO once upstream's checkable arcanum moves land (0.13.0):
// emit structured moves entries as well.

import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import { deterministicId, documentKey } from "./ids.js";
import { toSlug } from "../../src/utils/slug.js";

const WONDERS_SRC = "packs/src/wider-world-and-other-wonders";
const OUT_DIR = "packs/src/arcana/artifacts";
const FOLDER_DIR = "packs/src/arcana/_folders";
const PACK = "arcana";
const FOLDER_NAME = "Artifacts";

// NPC-shaped tag lines: spirits and followers share the artifact markup but are not items.
const NPC_TAGS = /\b(spirit|solitary|group|horde|primordial)\b|instinct/i;

/** Minimal HTML → the markdown dialect used by existing arcana descriptions. */
export function htmlToMarkdown(html) {
	let s = html;
	s = s.replace(/<img[^>]*>/g, "");                       // icons, decor — never content
	s = s.replace(/<hr[^>]*>/g, "");
	s = s.replace(/<\/?div[^>]*>/g, "");
	s = s.replace(/<(?:strong><em|em><strong)>/g, "**_").replace(/<\/(?:em><\/strong|strong><\/em)>/g, "_**");
	s = s.replace(/<\/?strong>/g, "**").replace(/<\/?em>/g, "*");
	s = s.replace(/<li[^>]*>/g, "\n- ").replace(/<\/li>/g, "");
	s = s.replace(/<\/?[ou]l[^>]*>/g, "\n");
	s = s.replace(/<tr[^>]*>/g, "\n- ").replace(/<\/tr>/g, "");
	s = s.replace(/<\/t[dh]>\s*<t[dh][^>]*>/g, " — ").replace(/<\/?t[dhr][^>]*>/g, "");
	s = s.replace(/<\/?(?:table|thead|tbody)[^>]*>/g, "\n");
	s = s.replace(/<\/p>\s*<p[^>]*>/g, "\n\n").replace(/<\/?p[^>]*>/g, "");
	s = s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
	return s.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** All artifact blocks in one article's rendered HTML. */
export function extractBlocks(html) {
	const blocks = [];
	const re = /<h3>(?:<img[^>]*>)?\s*([^<]+?)\s*<\/h3>\s*<p class="artifact-tags">(.*?)<\/p>/g;
	let m;
	while ((m = re.exec(html))) {
		// The journal build cross-links artifact headings to their arcana items, so the heading
		// text can arrive as @UUID[...]{Name} — the item's name (and slug) want the bare label.
		const name = htmlToMarkdown(m[1]).replace(/@UUID\[[^\]]*\]\{([^}]*)\}/g, "$1");
		// The book prints a tracking checkbox before some tags (□ magical); the glyph is page
		// furniture, not part of the tag.
		const tags = htmlToMarkdown(m[2]).replace(/□\s*/g, "");
		// Body: everything up to the next heading (any level). Column/page wrappers inside the
		// span are structural noise that htmlToMarkdown strips.
		const rest = html.slice(re.lastIndex);
		const end = rest.search(/<h[1-6][ >]/);
		const body = htmlToMarkdown(end === -1 ? rest : rest.slice(0, end));
		blocks.push({ name, tags, body });
	}
	return blocks;
}

function main() {
	const articles = fs.readdirSync(WONDERS_SRC).filter((f) => f.endsWith(".json"));
	fs.rmSync(OUT_DIR, { recursive: true, force: true });
	fs.mkdirSync(OUT_DIR, { recursive: true });

	const folderId = deterministicId(PACK, `folder:${FOLDER_NAME}`);
	fs.mkdirSync(FOLDER_DIR, { recursive: true });
	fs.writeFileSync(path.join(FOLDER_DIR, "artifacts.json"), JSON.stringify({
		name: FOLDER_NAME, type: "Item", description: "", folder: null,
		sorting: "a", sort: 0, color: null, flags: {},
		_id: folderId, _key: documentKey("Folder", folderId),
	}, null, "\t") + "\n");

	let count = 0, skipped = 0;
	for (const file of articles) {
		const entry = JSON.parse(fs.readFileSync(path.join(WONDERS_SRC, file), "utf8"));
		for (const page of entry.pages ?? []) {
			const html = page.text?.content ?? "";
			for (const { name, tags, body } of extractBlocks(html)) {
				if (NPC_TAGS.test(tags)) { skipped++; continue; }
				const slug = toSlug(name);
				const id = deterministicId(PACK, `artifact:${slug}`);
				// Tag lines arrive with <em> already converted to stars; only wrap bare tags.
				const note = tags.split(/,\s*/).map((t) => (/^\*|^value \d/i.test(t) ? t : `*${t}*`)).join(", ");
				// Front = the object as found; back = its revealed powers. Split at the first
				// move paragraph; an artifact that opens with a move keeps its lead paragraph
				// on both faces so neither is empty.
				const paras = body.split("\n\n");
				let cut = paras.findIndex((p) => /\*\*_|^When /.test(p));
				if (cut <= 0) cut = 1;
				const source =
					`*An artifact of the wider world — see @UUID[Compendium.stonetop.wider-world-and-other-wonders.JournalEntry.${entry._id}]{${entry.name}}.*`;
				const cardItem = { name, weight: 1, note, inventoryColumn: "regular" };
				const item = {
					_id: id, _key: documentKey("Item", id),
					name, type: "arcanum",
					system: {
						slug,
						front: {
							title: name,
							item: { ...cardItem },
							description: [...paras.slice(0, cut), source].join("\n\n"),
						},
						back: {
							title: name,
							item: { ...cardItem },
							description: [...paras.slice(cut), source].join("\n\n"),
							resource: null,
						},
					},
					flags: {},
					folder: folderId,
				};
				fs.writeFileSync(path.join(OUT_DIR, `${slug}.json`), JSON.stringify(item, null, "\t") + "\n");
				count++;
			}
		}
	}
	console.log(`artifacts: ${count} written to ${OUT_DIR}, ${skipped} NPC-shaped blocks skipped`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
