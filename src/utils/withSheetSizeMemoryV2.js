import { SheetSize } from "./SheetSize.js";
import { sheetSizeMemory } from "./SheetSizeMemory.js";

// How long after the last resize/drag to persist the size — avoids a localStorage write per mouse-move.
const SAVE_DEBOUNCE_MS = 500;

/**
 * ApplicationV2 sheet base mixin: remembers a sheet's window size (per sheet type) and reopens it
 * at that size. V2 counterpart of withSheetSizeMemory (which stays until the last V1 sheet is gone).
 *
 * ApplicationV2 freezes `this.options` at construction, so the saved size is injected in
 * `_initializeApplicationOptions` (pre-freeze) instead of the constructor. Saves hang off
 * `_onPosition`, which V2 calls after every setPosition (drag, resize, programmatic) with the full
 * merged position.
 *
 * @param Base    the ApplicationV2 document-sheet base to extend (needs `options.document`).
 * @param memory  the SheetSizeMemory store (injectable for tests; defaults to the shared singleton).
 */
export function withSheetSizeMemoryV2(Base, memory = sheetSizeMemory) {
	return class SheetSizeMemoryMixin extends Base {
		#saveSize = foundry.utils.debounce((size) => memory.set(this.#sizeKey(), size), SAVE_DEBOUNCE_MS);

		_initializeApplicationOptions(options) {
			const opts = super._initializeApplicationOptions(options);
			const key = SheetSizeMemoryMixin.#keyFor(options.document);
			const saved = key ? memory.get(key) : null;
			if (saved) opts.position = { ...opts.position, width: saved.width, height: saved.height };
			return opts;
		}

		// Storage key: the document's type is enough to share size across all sheets of that type
		// (e.g. "Actor.character", "Item.follower"). Null when there's no document to key on.
		static #keyFor(doc) {
			return doc?.documentName && doc?.type ? `${doc.documentName}.${doc.type}` : null;
		}

		#sizeKey() {
			return SheetSizeMemoryMixin.#keyFor(this.document);
		}

		_onPosition(position) {
			super._onPosition(position);
			const size = SheetSize.fromObject(position);
			if (size && this.#sizeKey()) this.#saveSize(size);
		}
	};
}
