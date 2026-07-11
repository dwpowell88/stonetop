// Extract the spirit / named-power / follower stat blocks embedded in the Wider World articles.
//
//   node scripts/import/build-spirits.js
//
// Reads the wider-world-and-other-wonders pack SOURCE (the already-rendered article HTML), like
// build-artifacts.js — no PDF tooling needed, rerunnable after any pack regeneration. The same
// `<h3>` + `<p class="artifact-tags">` markup that carries artifacts also carries NPC-shaped
// blocks (which build-artifacts skips by their tag lines); this tool extracts those:
//
//   packs/src/wider-world-npcs/spirits/<slug>.json   Actor docs — the social-spirit blocks
//     (gods-and-religion, spirits-of-the-wild), the named spirits (The Halfeyd, Troelloff) and
//     Primordial flame. A subdirectory (+ the committed _folders doc) rather than the pack root,
//     both for a compendium folder and because build-npcs wipes the pack root's *.json on re-run.
//   packs/src/followers/ferriers-fen/<slug>.json     follower Items — Alastar, Fiadh, Riona.
//     The book presents them as notable fen-walker guides (tags + Instinct + Cost only), so each
//     is composed on the fen-walker base stat block from the NPC pack (hp/armor/damage/moves),
//     with their own tags appended and their own instinct/cost.
//
// Field mapping (the blocks are run-in prose, not the monster stat-block grid): the tag line →
// tagList; **Instinct** → instinct; **Notes** → notes; **HP/Armor/Damage/Special qualities** →
// their fields; **Cost** → cost (and marks the block as a follower); **Manifests**/**Expects**
// (social-spirit fields with no schema slot) stay as bold-labeled paragraphs in `moves`, which
// renders markdown. Move bullets and lore prose also land in `moves`, matching build-npcs. The
// Fen trio's tag line spills into the body ("…; **Instinct** to" / "feel no remorse; **Cost** …"),
// so the spilled fields are rejoined to the first body paragraph before parsing.
//
// Ids are deterministic, so regeneration never breaks links. Item type is the current `npc`;
// upstream 0.13.0 renames the follower Item type to `follower` — flip FOLLOWER_TYPE after that
// merge and re-run.

import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import { deterministicId, documentKey } from "./ids.js";
import { htmlToMarkdown } from "./build-artifacts.js";
import { journalUuid, MONSTER_PACK } from "./pdf/creatures.js";
import { toSlug } from "../../src/utils/slug.js";

const WONDERS_SRC = "packs/src/wider-world-and-other-wonders";
const NPC_OUT = `packs/src/${MONSTER_PACK}/spirits`;
const NPC_FOLDERS = `packs/src/${MONSTER_PACK}/_folders`;
const NPC_FOLDER_NAME = "Spirits & powers";
const FOLLOWER_PACK = "followers";
const FOLLOWER_OUT = `packs/src/${FOLLOWER_PACK}/ferriers-fen`;
const FOLLOWER_FOLDERS = `packs/src/${FOLLOWER_PACK}/_folders`;
const FOLLOWER_FOLDER_NAME = "Ferrier's Fen";
const FOLLOWER_TYPE = "npc"; // 0.13.0 renames the follower Item type to "follower"
const FEN_WALKER = `packs/src/${MONSTER_PACK}/fen-walker.json`;

// Same discriminator build-artifacts.js uses to *skip* these blocks.
const NPC_TAGS = /\b(spirit|solitary|group|horde|primordial)\b|instinct/i;

const FIELD_LABELS = "HP|Armor|Damage|Instinct|Special qualit\\w*|Cost|Notes|Manifests|Expects";
const FIELD_START = new RegExp(`^\\*\\*(?:${FIELD_LABELS})\\*\\*`, "i");
const FIELD_SPLIT = new RegExp(`(?=\\*\\*(?:${FIELD_LABELS})\\*\\*)`, "i");
const FIELD_PARSE = new RegExp(`^\\*\\*(${FIELD_LABELS})\\*\\*:?\\s*([\\s\\S]*)$`, "i");

// A pick-list (Selection) field's stored raw shape — see src/data/creature.js selectionField().
const selection = (selected, multi) => ({ selected, options: [], multi, allowCustom: true });

const stripEmphasis = (s) => s.replace(/\*/g, "");
const tidyValue = (s) => s.trim().replace(/[;.]+$/, "").trim();

/** All NPC-shaped blocks in one article's rendered HTML: { name, icon, tags, body }. The body has
 *  embedded stat-block asides stripped (those creatures are separate build-npcs actors). */
export function extractNpcBlocks(html) {
	const blocks = [];
	const re = /<h3>(?:<img class="icon" src="([^"]+)">)?\s*([^<]+?)\s*<\/h3>\s*<p class="artifact-tags">(.*?)<\/p>/g;
	let m;
	while ((m = re.exec(html))) {
		const tags = htmlToMarkdown(m[3]);
		if (!NPC_TAGS.test(tags)) continue;
		const rest = html.slice(re.lastIndex);
		const end = rest.search(/<h[1-6][ >]/);
		const bodyHtml = (end === -1 ? rest : rest.slice(0, end)).replace(/<aside[\s\S]*?<\/aside>/g, "");
		blocks.push({ name: htmlToMarkdown(m[2]), icon: m[1] || null, tags, body: htmlToMarkdown(bodyHtml) });
	}
	return blocks;
}

/**
 * Parse one block's tag line + markdown body into shared-creature fields. Returns
 * { tagList, hp, armor, damage, specialQuality, instinct, cost, notes, moves } — `moves` is the
 * assembled markdown (bullets, labeled Manifests/Expects paragraphs, lore prose, in book order);
 * `cost` is non-null only for follower blocks.
 */
export function parseNpcBlock({ tags, body }) {
	const out = {
		tagList: [], hp: { value: 0, max: 0 }, armor: "", damage: "", specialQuality: "",
		instinct: "", cost: null, notes: "", moves: [],
	};

	// The Fen followers' tag line runs into the first field ("…; **Instinct** to"); split the
	// spilled fields off and rejoin them to the first body paragraph (the sentence continues there).
	let tagsPart = tags, spill = "";
	const fm = tags.search(FIELD_SPLIT);
	if (fm > 0) { spill = tags.slice(fm).trim(); tagsPart = tags.slice(0, fm); }
	out.tagList = tagsPart.split(/,\s*/).map((t) => tidyValue(stripEmphasis(t))).filter(Boolean);

	const paras = body.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
	if (spill) paras[0] = paras.length ? `${spill} ${paras[0]}` : spill;

	for (const para of paras) {
		if (/^- /.test(para)) { out.moves.push(para); continue; }
		if (!FIELD_START.test(para)) { out.moves.push(para); continue; } // lore prose (incl. "Something interesting/useful")
		for (const seg of para.split(FIELD_SPLIT)) {
			const f = seg.match(FIELD_PARSE);
			if (!f) continue;
			const label = f[1].toLowerCase();
			const value = f[2];
			if (label === "hp") { const n = parseInt(value, 10); out.hp = { value: n || 0, max: n || 0 }; }
			else if (label === "armor") out.armor = tidyValue(stripEmphasis(value));
			else if (label === "damage") out.damage = stripEmphasis(tidyValue(value));
			else if (label.startsWith("special")) out.specialQuality = tidyValue(stripEmphasis(value));
			else if (label === "instinct") out.instinct = tidyValue(value);
			else if (label === "cost") out.cost = tidyValue(value);
			else if (label === "notes") out.notes = value.trim();
			else out.moves.push(`**${f[1]}** ${value.trim()}`); // Manifests / Expects
		}
	}
	out.moves = out.moves.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
	return out;
}

const sourceLink = (article) =>
	`Source: @UUID[${journalUuid(article.slug)}]{${article.title}}${article.page ? ` (Book p.${article.page})` : ""}`;

/** Actor doc for a spirit/power block — same shape as build-npcs' toNpcDoc. */
export function toSpiritDoc(block, creature, { article, folder }) {
	const slug = toSlug(block.name);
	const id = deterministicId(MONSTER_PACK, slug);
	return {
		_id: id,
		_key: documentKey("Actor", id),
		name: block.name,
		type: "npc",
		img: block.icon || "icons/svg/mystery-man.svg",
		system: {
			slug,
			reference: article.slug,
			tagList: selection(creature.tagList, true),
			hp: creature.hp,
			armor: creature.armor,
			damage: creature.damage,
			specialQuality: creature.specialQuality,
			instinct: selection(creature.instinct ? [creature.instinct] : [], false),
			moves: creature.moves,
			description: sourceLink(article),
			notes: creature.notes,
		},
		ownership: { default: 0 },
		flags: {},
		folder,
	};
}

/** Follower Item doc for a named fen-walker guide, composed on the fen-walker base stat block. */
export function toGuideDoc(block, creature, { article, base, folder }) {
	const slug = toSlug(block.name);
	const id = deterministicId(FOLLOWER_PACK, slug);
	const baseTags = base.system.tagList.selected.filter((t) => !/see below/i.test(t));
	return {
		_id: id,
		_key: documentKey("Item", id),
		name: block.name,
		type: FOLLOWER_TYPE,
		img: block.icon || "icons/svg/mystery-man.svg",
		system: {
			slug,
			reference: article.slug,
			arcanaSlug: null,
			playbookSlug: null,
			owned: false,
			tagList: selection([...baseTags, ...creature.tagList], true),
			hp: { ...base.system.hp },
			armor: base.system.armor,
			damage: base.system.damage,
			specialQuality: base.system.specialQuality,
			instinct: selection(creature.instinct ? [creature.instinct] : [], false),
			cost: selection(creature.cost ? [creature.cost] : [], false),
			loyalty: { value: 0, max: 3 },
			moves: base.system.moves,
			description: `A notable fen-walker guide — base stats from the @UUID[Compendium.stonetop.${MONSTER_PACK}.Actor.${base._id}]{${base.name}} stat block.\n\n${sourceLink(article)}`,
			notes: creature.notes,
		},
		flags: {},
		folder,
	};
}

/** Committed folder doc; pack.js's ensureFolders keeps an existing file's _id, so write once. */
function folderDoc(pack, name, type) {
	const id = deterministicId(pack, `folder:${name}`);
	return {
		name, type, description: "", folder: null, sorting: "a", sort: 0, color: null, flags: {},
		_id: id, _key: documentKey("Folder", id),
	};
}

function main() {
	const base = JSON.parse(fs.readFileSync(FEN_WALKER, "utf8"));
	for (const dir of [NPC_OUT, FOLLOWER_OUT, NPC_FOLDERS, FOLLOWER_FOLDERS]) fs.mkdirSync(dir, { recursive: true });
	for (const dir of [NPC_OUT, FOLLOWER_OUT]) // rebuild fresh (dedicated dirs)
		for (const f of fs.readdirSync(dir).filter((n) => n.endsWith(".json"))) fs.rmSync(path.join(dir, f));

	const npcFolder = folderDoc(MONSTER_PACK, NPC_FOLDER_NAME, "Actor");
	const followerFolder = folderDoc(FOLLOWER_PACK, FOLLOWER_FOLDER_NAME, "Item");
	fs.writeFileSync(path.join(NPC_FOLDERS, "spirits.json"), JSON.stringify(npcFolder, null, "\t") + "\n");
	fs.writeFileSync(path.join(FOLLOWER_FOLDERS, "ferriers-fen.json"), JSON.stringify(followerFolder, null, "\t") + "\n");

	const seen = new Map(); // slug -> article (cross-article name collisions)
	let actors = 0, followers = 0;
	for (const file of fs.readdirSync(WONDERS_SRC).filter((f) => f.endsWith(".json")).sort()) {
		const entry = JSON.parse(fs.readFileSync(path.join(WONDERS_SRC, file), "utf8"));
		const articleSlug = file.replace(/\.json$/, "");
		for (const page of entry.pages ?? []) {
			const html = page.text?.content ?? "";
			const page_ = html.match(/wonder-pageref">[^<]*?p\.([\d–-]+)/)?.[1] ?? "";
			const article = { slug: articleSlug, title: entry.name, page: page_ };
			for (const block of extractNpcBlocks(html)) {
				const slug = toSlug(block.name);
				if (seen.has(slug)) { console.warn(`? duplicate "${block.name}" in ${articleSlug} (also ${seen.get(slug)}) — keeping first`); continue; }
				seen.set(slug, articleSlug);
				const creature = parseNpcBlock(block);
				if (creature.cost != null) {
					const doc = toGuideDoc(block, creature, { article, base, folder: followerFolder._id });
					fs.writeFileSync(path.join(FOLLOWER_OUT, `${slug}.json`), JSON.stringify(doc, null, "\t") + "\n");
					followers++;
				} else {
					const doc = toSpiritDoc(block, creature, { article, folder: npcFolder._id });
					fs.writeFileSync(path.join(NPC_OUT, `${slug}.json`), JSON.stringify(doc, null, "\t") + "\n");
					actors++;
				}
			}
		}
	}
	console.log(`spirits: ${actors} actors → ${NPC_OUT}, ${followers} followers → ${FOLLOWER_OUT}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
