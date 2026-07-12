# stonetop-art — illustrations from the Stonetop books

The Stonetop compendium can show the artwork from the books, but that art is copyrighted, so it
can't be shipped with the system. This folder is where it goes. It starts empty — if you own the
books, you can fill it from your own PDFs. If you don't, no problem: the game works normally, the
pictures are just missing.

## Generating the art

You need the book PDFs. Then run one command:

```sh
npm run extract-art -- path/to/Book_II.pdf path/to/Book_I.pdf
```

That fills this folder with the illustrations — the wonders, the arcana, and the steading residents.
Book I is optional: leave it off and you only miss the steading illustrations. (If your PDFs already sit
in the `helper/` folder, plain `npm run extract-art` finds them.)

You can re-run it any time; it just refreshes the files.

## Using it in Foundry

Copy this whole folder into Foundry's data directory as **`Data/stonetop-art/`** — next to the
system, not inside it, so updating Stonetop never wipes your art. Re-copy it whenever you regenerate.
That's all; Foundry picks up the pictures on its own.


## Fork extras (personal branch)

The companion module's importers add two more categories here, same deal as the wonders:

| Path                | Source              | Regenerate with                                          |
| ------------------- | ------------------- | -------------------------------------------------------- |
| `book-i/<hash>.png` | Book I chapters     | `node scripts/import/pdf/build-book1-journal.js`          |
| `maps/<slug>.png`   | Setting/handout PDFs| `node scripts/import/pdf/build-maps.js`                   |

Both take `MODULE_DIR=` pointing at the companion module. After regenerating anything, run the
companion repo's `node tools/verify-art.mjs` — every `stonetop-art/...` ref in both pack trees
must resolve before deploying.
