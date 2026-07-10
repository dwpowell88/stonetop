// Build the companion module's "maps-and-handouts" pack: one journal entry holding a labeled
// handout image per map, plus the art files under stonetop-art/maps/.
//
//   node scripts/import/pdf/build-maps.js          (run from system/, PDF binaries on PATH)
//
// Sources (env-overridable; defaults point at the owner's OneDrive PDF library):
//  - Setting Overview handout: vector pages whose map labels are live text. We render each page
//    at 300 dpi and erase every text line set in the body fonts (Caslon roman/bold, Avara heads),
//    keeping the FellType small-caps map labels and the italic edge notes ("to Barrier Pass...").
//    A loose per-map window then auto-trims to the surviving ink.
//  - All_maps 11x14: flattened 2100x1650 rasters. Marshedge and Gordin's Delve have no labeled
//    map in any official PDF (their chapter art is a panorama; points of interest are text lists),
//    so those two pages ship as-is and the journal links to their Wider World articles instead.
import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { loadStext } from "./stext.js";
import { decode8bit, encodeRGB } from "./png.js";
import { deterministicId, documentKey } from "../ids.js";

const PDF_LIBRARY = process.env.STONETOP_PDF_DIR ?? "C:/Users/dwpow/OneDrive/TTRPG/PDFs/Stone Top";
const SETTING_PDF = process.env.SETTING_PDF ?? path.join(PDF_LIBRARY, "Stonetop_Handouts/Stonetop Handouts/Handout - Setting Overview.pdf");
const ALLMAPS_PDF = process.env.ALLMAPS_PDF ?? path.join(PDF_LIBRARY, "Stonetop All_maps_-_11_x_14.pdf");

const ART_DIR = "stonetop-art/maps";
const MODULE_DIR = process.env.MODULE_DIR ?? "../module/stonetop-companion";
const PACK_DIR = `${MODULE_DIR}/packs/src/maps-and-handouts`;
const MACROS_DIR = `${MODULE_DIR}/packs/src/companion-macros`;
const WONDERS_SRC = "packs/src/wider-world-and-other-wonders";
const NAMESPACE = "stonetop-companion.maps-and-handouts";
const DPI = 300;

// Map label fonts to KEEP; everything else on the handout pages is wrapped body text.
const KEEP_FONT = /FellType|Italic/;

// Per-map loose windows in PDF points (handout pages are 792x612 landscape letter). The window
// only needs to contain the map and exclude the page decor (torn-paper strips, title art); the
// body text inside it is erased by font and the final crop auto-trims to the remaining ink.
const HANDOUT_MAPS = [
	{ slug: "stonetop", page: 2, window: [264, 228, 780, 514] },
	{ slug: "the-vicinity", page: 3, window: [196, 100, 784, 482] },
	{ slug: "the-worlds-end", page: 4, window: [152, 88, 770, 502] },
];

const ALLMAPS_PAGES = [
	{ slug: "marshedge", page: 4 },
	{ slug: "gordins-delve", page: 5 },
];

function renderPage(pdf, page, dpi, outPrefix) {
	execFileSync("pdftoppm", ["-png", "-r", String(dpi), "-f", String(page), "-l", String(page), pdf, outPrefix]);
	// pdftoppm zero-pads the page suffix depending on the document's page count.
	const dir = path.dirname(outPrefix), base = path.basename(outPrefix);
	const file = fs.readdirSync(dir).find((f) => f.startsWith(base) && f.endsWith(".png"));
	if (!file) throw new Error(`pdftoppm produced no output for ${pdf} p.${page}`);
	return path.join(dir, file);
}

/** Erase text lines set in body fonts, then crop to the ink inside the window (plus padding). */
function extractHandoutMap(img, stextPage, windowPt) {
	const { width, height, channels, px } = img;
	if (channels !== 3) throw new Error(`expected RGB render, got ${channels} channels`);
	const s = DPI / 72;

	for (const line of stextPage.lines) {
		if (KEEP_FONT.test(line.font)) continue;
		const pad = 1.5; // pt; text bboxes are tight and adjacent map ink is never this close
		const x0 = Math.max(0, Math.floor((line.bbox[0] - pad) * s));
		const y0 = Math.max(0, Math.floor((line.bbox[1] - pad) * s));
		const x1 = Math.min(width, Math.ceil((line.bbox[2] + pad) * s));
		const y1 = Math.min(height, Math.ceil((line.bbox[3] + pad) * s));
		for (let y = y0; y < y1; y++) px.fill(255, (y * width + x0) * 3, (y * width + x1) * 3);
	}

	const wx0 = Math.floor(windowPt[0] * s), wy0 = Math.floor(windowPt[1] * s);
	const wx1 = Math.min(width, Math.ceil(windowPt[2] * s)), wy1 = Math.min(height, Math.ceil(windowPt[3] * s));

	// Auto-trim: bounding box of non-white pixels within the window.
	let ix0 = wx1, iy0 = wy1, ix1 = wx0, iy1 = wy0;
	for (let y = wy0; y < wy1; y++) {
		for (let x = wx0; x < wx1; x++) {
			const p = (y * width + x) * 3;
			if (px[p] < 245 || px[p + 1] < 245 || px[p + 2] < 245) {
				if (x < ix0) ix0 = x;
				if (x > ix1) ix1 = x;
				if (y < iy0) iy0 = y;
				if (y > iy1) iy1 = y;
			}
		}
	}
	if (ix0 > ix1) throw new Error("window contains no ink — check the crop window");
	const mpx = Math.round(10 * s); // 10pt padding around the ink
	ix0 = Math.max(wx0, ix0 - mpx); iy0 = Math.max(wy0, iy0 - mpx);
	ix1 = Math.min(wx1, ix1 + mpx + 1); iy1 = Math.min(wy1, iy1 + mpx + 1);

	const cw = ix1 - ix0, ch = iy1 - iy0;
	const out = Buffer.alloc(cw * ch * 3);
	for (let y = 0; y < ch; y++) px.copy(out, y * cw * 3, ((iy0 + y) * width + ix0) * 3, ((iy0 + y) * width + ix1) * 3);
	// The handout screens the map art back (light gray) so body text can sit on it; with the text
	// gone, deepen the ink so the linework holds up in Foundry's journal viewer. Labels are already
	// black and white stays white.
	for (let i = 0; i < out.length; i++) out[i] = Math.max(0, 255 - (255 - out[i]) * 1.8);
	return encodeRGB(cw, ch, out);
}

/** _id of a wonders article by slug (its source file name), for @UUID links. */
function wondersId(slug) {
	return JSON.parse(fs.readFileSync(path.join(WONDERS_SRC, `${slug}.json`), "utf8"))._id;
}
function wondersName(slug) {
	return JSON.parse(fs.readFileSync(path.join(WONDERS_SRC, `${slug}.json`), "utf8")).name;
}
const wondersLink = (slug, label) =>
	`@UUID[Compendium.stonetop.wider-world-and-other-wonders.JournalEntry.${wondersId(slug)}]{${label}}`;

function buildEntry() {
	const entryId = deterministicId(NAMESPACE, "maps");
	const page = (slug, name, sort, fields) => ({
		_id: deterministicId(NAMESPACE, `maps/${slug}`),
		_key: `!journal.pages!${entryId}.${deterministicId(NAMESPACE, `maps/${slug}`)}`,
		name,
		title: { show: false, level: 1 },
		sort,
		ownership: { default: -1 },
		flags: { stonetop: { slug: `maps/${slug}` } },
		...fields,
	});

	const imagePage = (slug, name, sort, caption) =>
		page(slug, name, sort, { type: "image", src: `${ART_DIR}/${slug}.png`, image: { caption } });

	const intro = `<p>Handout maps of Stonetop and the lands around it, ready to show at the table. The village, Vicinity, and World's End maps carry their place names; Marshedge and Gordin's Delve have no labeled map in print — their points of interest are described in the linked articles.</p><ul><li><strong>Stonetop</strong> — the village itself: ${wondersLink("the-village-of-stonetop", "The Village of Stonetop")}</li><li><strong>The Vicinity</strong> — the village's immediate surroundings: ${wondersLink("the-great-wood", "The Great Wood")}, ${wondersLink("the-flats", "The Flats")}, ${wondersLink("the-foothills", "The Foothills")}, ${wondersLink("the-maw", "The Maw")}, ${wondersLink("red-groves", "Red Groves")}, ${wondersLink("the-ruined-tower", "The Ruined Tower")}, ${wondersLink("the-stream", "The Stream")}</li><li><strong>The World's End</strong> — the wider region: ${wondersLink("welcome-to-the-worlds-end", "Welcome to the World's End")}</li><li><strong>Marshedge</strong> — ${wondersLink("marshedge", "Marshedge")}</li><li><strong>Gordin's Delve</strong> — ${wondersLink("gordins-delve", "Gordin's Delve")}</li></ul>`;

	return {
		_id: entryId,
		_key: documentKey("JournalEntry", entryId),
		name: "Maps of the World's End",
		pages: [
			page("about", "About these maps", 100000, { type: "text", text: { content: intro, format: 1 } }),
			imagePage("stonetop", "Stonetop", 200000, "Stonetop — the village itself"),
			imagePage("the-vicinity", "The Vicinity", 300000, "The Vicinity — the village's immediate surroundings"),
			imagePage("the-worlds-end", "The World's End", 400000, "The World's End — the region in which Stonetop sits"),
			imagePage("marshedge", "Marshedge", 500000, "Marshedge — places of interest are described in the Marshedge article"),
			imagePage("gordins-delve", "Gordin's Delve", 600000, "Gordin's Delve — places of interest are described in the Gordin's Delve article"),
		],
		folder: null,
		sort: 100000,
		ownership: { default: 0 },
		flags: { stonetop: { slug: "maps" } },
	};
}

// Blank GM-note stubs for labels that have no Wider World article, filed in per-location
// compendium folders. The wire-map-labels macro points those labels here ("companion:<slug>"
// values in TILE_TARGETS below).
const STUB_FOLDERS = ["Stonetop", "The Vicinity"];
const STUBS = [
	{ slug: "the-old-wall", name: "The Old Wall", folder: "Stonetop" },
	{ slug: "the-vicinity", name: "The Vicinity", folder: "The Vicinity" },
	{ slug: "cave-bears", name: "Cave Bears", folder: "The Vicinity" },
];

// Scene label tiles → the journal entry each should open. Keys are the tile's texture
// filename normalized to lowercase alphanumerics with any "text-" prefix stripped (so
// "text-Red%20Grove.png" → "redgrove", "lettering - stonetop.png" → "letteringstonetop").
// Values are wonders-article slugs — optionally "<slug>#<heading>" to deep-link a heading
// inside the article (the heading text must match the article's <h_> exactly; it is
// slugified into the journal anchor) — or "companion:<slug>" for the stub entries above.
const TILE_TARGETS = {
	// Stonetop (village features deep-link into the village article)
	letteringstonetop: "the-village-of-stonetop",
	thestone: "the-village-of-stonetop#The Stone",
	cistern: "the-village-of-stonetop#The Cistern",
	granary: "the-village-of-stonetop#Places",
	pavilion: "the-village-of-stonetop#Places",
	publichouse: "the-village-of-stonetop#Places",
	theringwall: "the-village-of-stonetop#Places",
	thefields: "the-village-of-stonetop#Places",
	thestream: "the-stream",
	thegreatwood: "the-great-wood",
	towestroad: "the-makers-roads",
	totheoldwall: "companion:the-old-wall",
	// The Vicinity
	letteringthevicinity1: "companion:the-vicinity",
	cavebears: "companion:cave-bears",
	foothills: "the-foothills",
	flats: "the-flats",
	themaw: "the-maw",
	redgrove: "red-groves",
	theruinedtower: "the-ruined-tower",
	thehighway: "the-makers-roads",
	thewestroad: "the-makers-roads",
	tobarrierpass: "barrier-pass",
	togordinsdelve: "gordins-delve",
	tosteplandsandmarshedge: "the-steplands",
	// The World's End
	letteringtheworldsend: "welcome-to-the-worlds-end",
	barrierpass: "barrier-pass",
	blackwaterlake: "blackwater-lake",
	dreadriver: "the-dread-river",
	farriersfen: "ferriers-fen", // sic: the tile file is spelled "farriers"
	goldenoak: "the-golden-oak",
	gordinsdelve: "gordins-delve",
	hufflepeaks: "huffel-peaks",
	marshedge: "marshedge",
	northmanmarch: "north-manmarch",
	southmanmarch: "south-manmarch",
	steplands: "the-steplands",
	theflats: "the-flats",
	threecovenlake: "three-coven-lake",
	titanbones: "titan-bones",
	tolygos: "lygos-and-the-south",
	torsfist: "the-whitefang-mountains#Tor’s Fist",
	whitefangmountains: "the-whitefang-mountains",
	// Town scenes' title wordmarks
	letteringmarshedge: "marshedge",
	letteringgordinsdelve: "gordins-delve",
};

const companionUuid = (slug) =>
	`Compendium.stonetop-companion.maps-and-handouts.JournalEntry.${deterministicId(NAMESPACE, slug)}`;

/** Per-location folders + blank stub entries for labels without a Wider World article. */
function buildStubs() {
	const folderIds = {};
	const docs = [];
	for (const name of STUB_FOLDERS) {
		const id = deterministicId(NAMESPACE, `folder/${name}`);
		folderIds[name] = id;
		docs.push({
			name, type: "JournalEntry", description: "", folder: null, sorting: "a",
			sort: 0, color: null, flags: {}, _id: id, _key: `!folders!${id}`,
		});
	}
	for (const stub of STUBS) {
		const entryId = deterministicId(NAMESPACE, stub.slug);
		const pageId = deterministicId(NAMESPACE, `${stub.slug}/main`);
		docs.push({
			_id: entryId,
			_key: documentKey("JournalEntry", entryId),
			name: stub.name,
			pages: [{
				_id: pageId,
				_key: `!journal.pages!${entryId}.${pageId}`,
				name: stub.name,
				type: "text",
				title: { show: false, level: 1 },
				text: { content: "", format: 1 },
				sort: 100000,
				ownership: { default: -1 },
				flags: { stonetop: { slug: `${stub.slug}/main` } },
			}],
			folder: folderIds[stub.folder],
			sort: 200000,
			ownership: { default: 0 },
			flags: { stonetop: { slug: stub.slug } },
		});
	}
	return docs;
}

function buildMacro() {
	const targets = {};
	for (const [key, value] of Object.entries(TILE_TARGETS)) {
		if (value.startsWith("companion:")) {
			const slug = value.slice("companion:".length);
			targets[key] = { uuid: companionUuid(slug), name: STUBS.find((s) => s.slug === slug).name };
		} else {
			const [slug, subsection] = value.split("#");
			const doc = JSON.parse(fs.readFileSync(path.join(WONDERS_SRC, `${slug}.json`), "utf8"));
			targets[key] = {
				uuid: `Compendium.stonetop.wider-world-and-other-wonders.JournalEntry.${doc._id}`,
				name: doc.name,
			};
			if (subsection) {
				targets[key].page = doc.pages[0]._id;
				targets[key].subsection = subsection;
			}
		}
	}

	const command = `// Wire the map scenes' label tiles to their Wider World journal articles via Monk's Active
// Tile Triggers: double-clicking a label opens the matching article — or, for labels with no
// Wider World article (the Old Wall, cave bears, the Vicinity title), a blank GM-notes stub
// in the Maps & Handouts compendium. Safe to re-run — it rewrites the MATT config on every
// label tile it recognizes, and lists any it has no target for.
if (!game.user.isGM) return ui.notifications.warn("Run this as a GM.");
if (!game.modules.get("monks-active-tiles")?.active)
	return ui.notifications.warn("Enable Monk's Active Tile Triggers first.");

const TARGETS = ${JSON.stringify(targets, null, "\t")};

const normalize = (src) => decodeURIComponent(src).split("/").pop()
	.replace(/\\.[a-z]+$/i, "").toLowerCase().replace(/^text-/, "").replace(/[^a-z0-9]+/g, "");

let wired = 0;
const skipped = [];
for (const scene of game.scenes) {
	const updates = [];
	for (const tile of scene.tiles) {
		const src = tile.texture?.src ?? "";
		const target = TARGETS[normalize(src)];
		if (!target) {
			// Report label-looking tiles we have no article for; ignore everything else.
			if (/(^|\\/)(text-|lettering)/i.test(decodeURIComponent(src)))
				skipped.push(\`\${scene.name}: \${decodeURIComponent(src).split("/").pop()}\`);
			continue;
		}
		updates.push({
			_id: tile.id,
			"flags.monks-active-tiles": {
				name: "", active: true, record: false, restriction: "all", controlled: "all",
				trigger: ["dblclick"], allowpaused: false, usealpha: false, pointer: true,
				vision: true, pertoken: false, minrequired: null, cooldown: null, chance: 100,
				fileindex: -1, files: [],
				actions: [{
					action: "openjournal",
					data: {
						entity: { id: target.uuid, name: target.name },
						page: target.page ?? "", subsection: target.subsection ?? "",
						showto: "trigger", asimage: false, permission: "true",
					},
					id: foundry.utils.randomID(16),
				}],
			},
		});
	}
	if (updates.length) {
		await scene.updateEmbeddedDocuments("Tile", updates);
		wired += updates.length;
	}
}
ui.notifications.info(\`Map labels wired: \${wired} tiles. No target for \${skipped.length} (see console).\`);
if (skipped.length) console.log("Map label tiles left unwired:", skipped);
`;

	const macroId = deterministicId(NAMESPACE, "macro/wire-map-labels");
	return {
		_id: macroId,
		_key: documentKey("Macro", macroId),
		name: "Wire map labels to journals",
		type: "script",
		author: null,
		img: "icons/svg/book.svg",
		scope: "global",
		command,
		folder: null,
		sort: 100000,
		ownership: { default: 0 },
		flags: { stonetop: { slug: "wire-map-labels" } },
	};
}

function main() {
	fs.mkdirSync(ART_DIR, { recursive: true });
	fs.mkdirSync(PACK_DIR, { recursive: true });
	const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "stonetop-maps-"));

	const stext = loadStext(SETTING_PDF, `${HANDOUT_MAPS[0].page}-${HANDOUT_MAPS.at(-1).page}`);
	for (const [i, map] of HANDOUT_MAPS.entries()) {
		const rendered = renderPage(SETTING_PDF, map.page, DPI, path.join(tmp, `so-${map.slug}`));
		const img = decode8bit(fs.readFileSync(rendered));
		const png = extractHandoutMap(img, stext[i], map.window);
		fs.writeFileSync(path.join(ART_DIR, `${map.slug}.png`), png);
		console.log(`${map.slug}.png <- Setting Overview p.${map.page} (${png.length.toLocaleString()} bytes)`);
	}

	for (const map of ALLMAPS_PAGES) {
		const rendered = renderPage(ALLMAPS_PDF, map.page, 150, path.join(tmp, `am-${map.slug}`));
		fs.copyFileSync(rendered, path.join(ART_DIR, `${map.slug}.png`));
		console.log(`${map.slug}.png <- All_maps p.${map.page}`);
	}

	fs.rmSync(tmp, { recursive: true, force: true });

	const entry = buildEntry();
	fs.writeFileSync(path.join(PACK_DIR, "maps.json"), JSON.stringify(entry, null, "\t") + "\n");
	console.log(`${PACK_DIR}/maps.json — ${entry.pages.length} pages`);

	fs.mkdirSync(path.join(PACK_DIR, "_folders"), { recursive: true });
	for (const doc of buildStubs()) {
		const dir = doc._key.startsWith("!folders!") ? path.join(PACK_DIR, "_folders") : PACK_DIR;
		const slug = (doc.flags?.stonetop?.slug ?? doc.name).toLowerCase().replace(/[^a-z0-9]+/g, "-");
		fs.writeFileSync(path.join(dir, `${slug}.json`), JSON.stringify(doc, null, "\t") + "\n");
	}
	console.log(`${PACK_DIR} — ${STUB_FOLDERS.length} folders, ${STUBS.length} stub entries`);

	const macro = buildMacro();
	fs.mkdirSync(MACROS_DIR, { recursive: true });
	fs.writeFileSync(path.join(MACROS_DIR, "wire-map-labels.json"), JSON.stringify(macro, null, "\t") + "\n");
	console.log(`${MACROS_DIR}/wire-map-labels.json — ${Object.keys(TILE_TARGETS).length} label targets`);
}

main();
