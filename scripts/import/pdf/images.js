import { execFileSync } from "child_process";
import { mkdirSync, readdirSync, readFileSync, renameSync, copyFileSync, rmSync, writeFileSync } from "fs";
import path from "path";
import { blackTransparent, whiteTransparent, inkFraction, rasterKey } from "./png.js";
import { loadBullets } from "./rules.js";
import { Raster } from "../../../src/art/Raster.js";

// `renameSync` fails with EXDEV across filesystems (e.g. a /tmp scratch dir → the repo); fall back to copy+delete.
function moveFile(src, dest) {
	try { renameSync(src, dest); }
	catch (e) { if (e.code === "EXDEV") { copyFileSync(src, dest); rmSync(src, { force: true }); } else throw e; }
}

/** Rewrite a 1-bit ink-mask PNG in place as black-on-transparent; leave anything else untouched. */
function normalize(file) {
	try { writeFileSync(file, blackTransparent(readFileSync(file))); }
	catch { /* not a 1-bit grayscale mask — keep as extracted */ }
}

/** Read width/height from a PNG IHDR (bytes 16–24). */
function pngSize(buf) {
	if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return null;
	return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/**
 * Extract the illustrations from a PDF page range. Each spread repeats tiny `stencil` images
 * (borders/dividers ≤ ~26px tall); the real art is large, so we keep images above a size
 * threshold. Returns `[{ file, width, height }]`. Map exclusion (the cartographic plates) is a
 * separate manual veto pass — see the plan.
 */
export function extractArt(pdf, range, outDir, slug, { minW = 200, minH = 100 } = {}) {
	mkdirSync(outDir, { recursive: true });
	const tmp = path.join(outDir, `_tmp_${slug}`);
	mkdirSync(tmp, { recursive: true });
	const [f, l] = String(range).includes("-") ? String(range).split("-") : [range, range];
	execFileSync("pdfimages", ["-png", "-f", String(f), "-l", String(l), pdf, path.join(tmp, "img")]);

	const kept = [];
	for (const file of readdirSync(tmp).sort()) {
		const sz = pngSize(readFileSync(path.join(tmp, file)));
		if (sz && sz.width >= minW && sz.height >= minH) {
			const dest = path.join(outDir, `${slug}-${kept.length}.png`);
			renameSync(path.join(tmp, file), dest);
			normalize(dest);
			kept.push({ file: dest, ...sz });
		}
	}
	rmSync(tmp, { recursive: true, force: true });
	return kept;
}

/** Illustration positions for a page, from the vector trace: large image masks with their
 *  left-edge x, top y, displayed width (pt) and pixel size — used to place art where the book
 *  has it and to match each position to its extracted PNG. */
export function pageIllustrations(pdf, page) {
	const xml = execFileSync("mutool", ["trace", pdf, String(page)], { encoding: "utf8", maxBuffer: 1 << 26 });
	const out = [];
	const re = /<fill_image_mask transform="([^"]*)"[^>]*width="(\d+)"\s+height="(\d+)"/g;
	let m;
	while ((m = re.exec(xml))) {
		const [a, , , d, e, f] = m[1].split(/\s+/).map(Number);
		const pxW = Number(m[2]), pxH = Number(m[3]);
		// ≥40px catches the small round marker icons (~75×75) but excludes the chain (26) and
		// braid (13) chrome, which are handled separately.
		if (pxH >= 40 && pxW >= 40) out.push({ x: Math.min(e, e + a), y: f, w: Math.abs(a), h: Math.abs(d), pxW, pxH });
	}
	return out;
}

/**
 * Extract a single page's illustrations and pair each with its book position (so it can be placed
 * inline). Returns `[{ file, x, y, w, pageH }]`. Files are normalized to black-on-transparent.
 *
 * With `dedup = { index: Map<hash,path>, dir }` the normalized PNG is content-addressed: identical
 * images (the same creature/marker icon repeated across many articles) are written once to
 * `dir/<hash>.png` and every later occurrence reuses that file. Without `dedup`, each image is written
 * per-article as `<slug>-N.png` (used by the preview / npc build, which discard the files).
 */
export function extractPageArt(pdf, page, outDir, slug, { minW = 40, minH = 40, dedup } = {}) {
	mkdirSync(outDir, { recursive: true });
	const tmp = path.join(outDir, `_tmp_${slug}`);
	mkdirSync(tmp, { recursive: true });
	execFileSync("pdfimages", ["-png", "-f", String(page), "-l", String(page), pdf, path.join(tmp, "img")]);

	const positions = pageIllustrations(pdf, page);
	const used = new Set();
	const out = [];
	for (const file of readdirSync(tmp).sort()) {
		const src = path.join(tmp, file);
		const sz = pngSize(readFileSync(src));
		if (!sz || sz.width < minW || sz.height < minH) continue;
		let pi = positions.findIndex((p, i) => !used.has(i) && p.pxW === sz.width && p.pxH === sz.height);
		if (pi < 0) pi = positions.findIndex((_, i) => !used.has(i));
		if (pi < 0) continue;
		used.add(pi);
		let box = false;
		try { box = inkFraction(readFileSync(src)) < 0.06; } catch { /* not a 1-bit mask */ } // a thin frame, not art
		normalize(src); // -> RGBA black-on-transparent (in place)
		let dest;
		if (dedup) {
			const hash = rasterKey(readFileSync(src));
			dest = dedup.index.get(hash);
			if (!dest) {
				// Recurring marker/bullet glyphs (trade dress) are routed by raster hash to a committed,
				// human-named file under `dedup.markers.dir`; every other image is a copyrighted
				// illustration, content-addressed into the gitignored `dedup.dir` store.
				const markerName = dedup.markers?.map?.[hash];
				const outForHash = markerName ? dedup.markers.dir : dedup.dir;
				mkdirSync(outForHash, { recursive: true });
				dest = path.join(outForHash, `${markerName ?? hash}.png`);
				moveFile(src, dest);
				dedup.index.set(hash, dest);
			}
		} else {
			dest = path.join(outDir, `${slug}-${out.length}.png`);
			moveFile(src, dest);
		}
		const p = positions[pi];
		out.push({ file: dest, x: p.x, y: p.y, w: p.w, h: p.h, box });
	}
	rmSync(tmp, { recursive: true, force: true });
	return out;
}

/**
 * Merge illustrations split across a facing-page pair back into one image. 1-up printings of
 * the book cut spread-spanning art at the gutter — the left half runs flush to its (even) page's
 * right edge, the right half starts flush at the next page's left edge, in the same vertical
 * band. 2-up printings embed the whole painting as a single image, so figure counts (and the
 * art itself) only match across printings once the halves are rejoined. Each piece bleeds ~1pt
 * past its page edge; that overhang duplicates the seam, so it's trimmed before joining.
 *
 * Mutates `pageImages` in place: the composite replaces the left piece (width spanning both
 * halves) and the right piece is dropped. `pages`/`pageImages` are the parallel per-page arrays
 * of `loadArticlePages`; dedup routing matches `extractPageArt`.
 */
export function stitchSpreads(startPage, pages, pageImages, dedup, mapFile = (f) => f) {
	const MIN = 40; // pts — ignore marker/icon glyphs
	for (let i = 0; i + 1 < pageImages.length; i++) {
		if ((startPage + i) % 2 !== 0) continue; // left page of a facing pair is even
		const pageW = pages[i].width;
		for (const a of pageImages[i]) {
			if (a.w < MIN || a.h < MIN || a.x + a.w < pageW - 3) continue;
			const bIdx = pageImages[i + 1].findIndex(
				(b) => b.w >= MIN && b.h >= MIN && b.x <= 3 && Math.abs(b.y - a.y) <= 3 && Math.abs(b.h - a.h) <= 3,
			);
			if (bIdx < 0) continue;
			const b = pageImages[i + 1][bIdx];
			const comp = stitchPair(a, b, pageW);
			if (!comp) continue;
			let dest;
			if (dedup) {
				const hash = rasterKey(Buffer.from(comp));
				dest = dedup.index.get(hash);
				if (!dest) {
					mkdirSync(dedup.dir, { recursive: true });
					dest = path.join(dedup.dir, `${hash}.png`);
					writeFileSync(dest, comp);
					dedup.index.set(hash, dest);
				}
			} else {
				dest = path.join(path.dirname(a.disk ?? a.file), `${path.basename(a.disk ?? a.file, ".png")}-spread.png`);
				writeFileSync(dest, comp);
			}
			// A half can fall under the thin-frame ink threshold on its own; the joined
			// painting is art, never a frame.
			Object.assign(a, { disk: dest, file: mapFile(dest), w: a.w + b.w, box: false });
			pageImages[i + 1].splice(bIdx, 1);
		}
	}
}

/** Join a spread's two halves horizontally (trimming the page-edge bleed overhang); returns
 *  PNG bytes, or null when the halves' pixel geometry can't line up. */
function stitchPair(a, b, pageW) {
	let A, B;
	try {
		A = Raster.fromPng(readFileSync(a.disk ?? a.file));
		B = Raster.fromPng(readFileSync(b.disk ?? b.file));
	} catch { return null; } // unreadable or non-PNG piece — leave the pair alone
	if (A.height !== B.height) return null;
	const trimA = Math.max(0, Math.round((a.x + a.w - pageW) * (A.width / a.w)));
	const trimB = Math.max(0, Math.round(-b.x * (B.width / b.w)));
	if (trimA + trimB >= A.width + B.width) return null;
	const ch = Math.max(A.channels, B.channels);
	const [pa, pb] = [promote(A, ch), promote(B, ch)];
	const wa = pa.width - trimA, wb = pb.width - trimB;
	const W = wa + wb, H = pa.height;
	const px = new Uint8Array(W * H * ch);
	for (let y = 0; y < H; y++) {
		px.set(pa.px.subarray(y * pa.width * ch, (y * pa.width + wa) * ch), y * W * ch);
		px.set(pb.px.subarray((y * pb.width + trimB) * ch, (y + 1) * pb.width * ch), (y * W + wa) * ch);
	}
	return new Raster(W, H, ch, px).toPng();
}

/** Widen a raster to `ch` channels (gray→RGB replication, opaque alpha). */
function promote(r, ch) {
	if (r.channels === ch) return r;
	const n = r.width * r.height;
	const px = new Uint8Array(n * ch);
	for (let i = 0; i < n; i++) {
		const [rr, gg, bb] = r.channels === 1
			? [r.px[i], r.px[i], r.px[i]]
			: [r.px[i * r.channels], r.px[i * r.channels + 1], r.px[i * r.channels + 2]];
		px[i * ch] = rr; px[i * ch + 1] = gg; px[i * ch + 2] = bb;
		if (ch === 4) px[i * ch + 3] = r.channels === 4 ? r.px[i * 4 + 3] : 255;
	}
	return new Raster(r.width, r.height, ch, px);
}

/**
 * Extract the shared decorative chrome (same on every page): the wide chain band that sits above
 * each title, and the thin braided rule used as a section separator. Black ink masks (extract as
 * white-on-black; display inverted). Returns `{ chain, rule }` file paths.
 */
export function extractChrome(pdf, outDir, page = 12) {
	mkdirSync(outDir, { recursive: true });
	const tmp = path.join(outDir, "_chrome");
	mkdirSync(tmp, { recursive: true });
	execFileSync("pdfimages", ["-png", "-f", String(page), "-l", String(page), pdf, path.join(tmp, "c")]);

	const out = {};
	for (const file of readdirSync(tmp).sort()) {
		const sz = pngSize(readFileSync(path.join(tmp, file)));
		if (!sz) continue;
		if (!out.chain && sz.width > 1000 && sz.height < 40) { out.chain = save(tmp, file, outDir, "chain.png"); normalize(out.chain); }
		else if (!out.rule && sz.width > 400 && sz.width < 1000 && sz.height < 20) { out.rule = save(tmp, file, outDir, "rule.png"); normalize(out.rule); }
	}
	rmSync(tmp, { recursive: true, force: true });
	return out;
}

function save(tmp, file, outDir, name) {
	const dest = path.join(outDir, name);
	renameSync(path.join(tmp, file), dest);
	return dest;
}

/**
 * Extract the two list-bullet swirl glyphs as shared assets (the plain spiral and the
 * spiral-with-arrow), by rendering their spots in the book at high res in 1-bit and converting to
 * black-on-transparent. Returns `{ bullet, point }` file paths.
 */
export function extractSwirls(pdf, outDir) {
	mkdirSync(outDir, { recursive: true });
	const R = 1200, ppt = R / 72, M = 1; // resolution, px/pt, margin (pt)
	const crop = (page, kind, name) => {
		const sw = loadBullets(pdf, page).find((s) => s.kind === kind);
		if (!sw) return null;
		const b = sw.box;
		const args = ["-x", Math.round((b.x0 - M) * ppt), "-y", Math.round((b.y0 - M) * ppt),
			"-W", Math.round((b.x1 - b.x0 + 2 * M) * ppt), "-H", Math.round((b.y1 - b.y0 + 2 * M) * ppt)].map(String);
		const prefix = path.join(outDir, `_sw_${name}`);
		execFileSync("pdftoppm", ["-mono", "-png", "-r", String(R), "-f", String(page), "-l", String(page), ...args, pdf, prefix]);
		const f = readdirSync(outDir).find((n) => n.startsWith(`_sw_${name}-`));
		const dest = path.join(outDir, `${name}.png`);
		// pdftoppm renders these as 8-bit black-on-white (RGB or gray), occasionally 1-bit mono —
		// make the white transparent either way, keeping a soft alpha edge.
		const src = readFileSync(path.join(outDir, f));
		let png;
		try { png = whiteTransparent(src); }                     // 8-bit gray/RGB
		catch { try { png = blackTransparent(src, 1); } catch { png = null; } } // 1-bit mono fallback
		if (png) writeFileSync(dest, png); else renameSync(path.join(outDir, f), dest);
		rmSync(path.join(outDir, f), { force: true });
		return dest;
	};
	return { bullet: crop(140, "bullet", "swirl"), point: crop(137, "point", "swirl-point") };
}
