// Compile the stonetop-companion module's pack source (JSON) into LevelDB. Run from the system
// checkout so it uses this package's @foundryvtt/foundryvtt-cli. Ids are deterministic (written
// by the importer), so no id/folder bookkeeping is needed here.
import { compilePack } from "@foundryvtt/foundryvtt-cli";
import { promises as fs } from "fs";

const MODULE = process.env.MODULE_DIR ?? "../module/stonetop-companion";
const PACKS = ["book-of-stonetop", "maps-and-handouts", "companion-macros"];

async function main() {
	for (const pack of PACKS) {
		const src = `${MODULE}/packs/src/${pack}`;
		try {
			await fs.access(src);
		} catch {
			console.log(`Skipping ${pack} — no source directory at ${src}`);
			continue;
		}
		const dest = `${MODULE}/packs/${pack}`;
		await fs.rm(dest, { recursive: true, force: true });
		await fs.mkdir(dest, { recursive: true });
		try {
			await compilePack(src, dest, { nedb: false, log: true, recursive: true });
		} catch (err) {
			// Node v24 + abstract-level teardown race: iterator cleanup races with DB close.
			// All files are written before this throws, so it's safe to ignore.
			if (err.code !== "LEVEL_ITERATOR_NOT_OPEN") throw err;
		}
	}
}

// process.exit prevents a Node v24 / abstract-level teardown race where open
// iterators are garbage-collected after the DB closes, causing a spurious crash.
main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
