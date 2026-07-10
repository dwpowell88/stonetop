# stonetop-art — copyrighted book illustrations (not committed)

The compendium packs reference illustrations from this folder using paths like
`stonetop-art/arcana/mindgem.png` and `stonetop-art/wonders/<hash>.png`. Those paths resolve to
**`Data/stonetop-art/...`** in a Foundry install (i.e. a top-level folder under Foundry's user
data dir, *outside* the system install, so it survives manifest re-installs of the system).

These images are extracted from the copyrighted Stonetop books and **are not redistributable**, so
everything in this folder except this README is git-ignored and never shipped. The shipped system
contains only "trade dress" (UI chrome and the small marker glyphs under
`assets/content/wonders/markers/`).

## What goes here

| Subfolder            | Source                          | How to get it                                              |
| -------------------- | ------------------------------- | ---------------------------------------------------------- |
| `wonders/<hash>.png` | Book II articles                | `node scripts/import/pdf/build-journal.js` (see below)     |
| `book-i/<hash>.png`  | Book I chapters                 | `node scripts/import/pdf/build-book1-journal.js`           |
| `maps/<slug>.png`    | Setting/handout PDFs            | `node scripts/import/pdf/build-maps.js`                    |
| `arcana/<slug>.png`  | Book II (manual crop)           | supply manually, named by item slug                        |
| `playbooks/<slug>.png` | Book I pp. 105–137 (manual crop) | supply manually, named by playbook slug                  |
| `steading/*.png`     | Book I                          | supply manually                                            |

The importers shell out to `mutool` (MuPDF) and poppler's `pdfimages`/`pdftoppm`; install those
first (`dnf install mupdf poppler-utils`, `apt install mupdf-tools poppler-utils`, or similar).
Point them at your own PDFs with `BOOK_PDF=/path/to/book.pdf`.

## The content-addressing caveat (read before extracting)

Hashed filenames (`wonders/`, `book-i/`) cover the **final encoded PNG bytes**, and the encoder's
zlib deflate step produces different bytes on different zlib builds — pixel-identical images,
different hashes. Consequences:

- **You cannot reproduce someone else's committed hashes** (including the ones shipped in this
  repo's pack source). This has been verified the hard way: an exhaustive deflate parameter sweep
  and a pako fallback both fail to match across toolchains.
- Therefore art files and the pack refs that point at them must come from the **same importer run
  on the same machine**. Don't run `extract-art.js` alone and expect shipped refs to resolve;
  run the full journal build (`build-journal.js` / `build-book1-journal.js`), which extracts the
  art *and* rewrites the pack source refs together, then recompile packs (`npm run pack`).
- Recurring marker glyphs (trade dress, shipped in `assets/`) are recognized and routed *out* of
  this folder by sha256 via `scripts/import/pdf/trade-dress.json`. On a new toolchain your marker
  hashes won't be listed there yet — if small swirl/marker glyphs start appearing under
  `wonders/`, add your toolchain's hashes to that routing table (keep the existing entries; it is
  a merged, multi-toolchain list).

Slug-named categories (`arcana/`, `maps/`, `playbooks/`, `steading/`) have none of these problems:
any correctly-named file resolves, whatever produced it. Arcana and playbook portraits are manual
crops — raw PDF extraction does not reproduce them — sized to taste; the slug is the item's/
playbook's slug in the pack source.

## Fresh-machine checklist

1. Install `mupdf` + `poppler-utils`; `npm install`.
2. `BOOK_PDF=/path/to/Book_II.pdf node scripts/import/pdf/build-journal.js` — populates
   `wonders/` and rewrites the wider-world pack refs in the same run.
3. (Fork extras, if you use them) `build-book1-journal.js` for `book-i/`, `build-maps.js` for
   `maps/` — both take `MODULE_DIR=` for where the companion module lives.
4. Copy your manual art (`arcana/`, `playbooks/`, `steading/`) from your previous machine — being
   slug-named, it needs no regeneration. Hash-named art can be copied too, as long as you copy the
   matching regenerated pack source with it.
5. `npm run pack`, then check every `stonetop-art/...` ref in `packs/src/**` resolves to a file
   here before deploying.

## Using it on a Foundry server

1. Populate this folder locally (steps above).
2. Copy it to your server's data dir as **`Data/stonetop-art/`**, and re-sync after re-imports.

For local development, `scripts/development/link.sh` also symlinks `Data/stonetop-art` → this
folder so a linked dev world resolves the art with no copying.

Players/GMs who don't own the books simply won't have these files; the system still works, those
illustrations just show as missing images.
