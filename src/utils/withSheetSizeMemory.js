import { SheetSize } from "./SheetSize.js";
import { sheetSizeMemory } from "./SheetSizeMemory.js";

// How long after the last resize/drag to persist the size — avoids a localStorage write per mouse-move.
const SAVE_DEBOUNCE_MS = 500;

/**
 * Sheet base mixin: remembers a sheet's window size (per sheet type) and reopens it at that size.
 *
 * Applied at the two Foundry base classes (ActorSheet / ItemSheet) so every Stonetop sheet inherits it.
 * On construction it loads the saved size and seeds `this.position`/`this.options` before the first
 * render (so there's no resize flash); on every `setPosition` it debounce-saves the resulting size.
 *
 * @param Base    the Foundry Application sheet base to extend.
 * @param memory  the SheetSizeMemory store (injectable for tests; defaults to the shared singleton).
 */
export function withSheetSizeMemory(Base, memory = sheetSizeMemory) {
	return class SheetSizeMemoryMixin extends Base {
		#saveSize;

		constructor(...args) {
			super(...args);
			this.#saveSize = foundry.utils.debounce((size) => memory.set(this.#sizeKey(), size), SAVE_DEBOUNCE_MS);

			const saved = this.#sizeKey() ? memory.get(this.#sizeKey()) : null;
			if (saved) {
				this.options.width = saved.width;
				this.options.height = saved.height;
				this.position.width = saved.width;
				this.position.height = saved.height;
			}
		}

		// Storage key: the document's type is enough to share size across all sheets of that type
		// (e.g. "Actor.character", "Item.follower"). Null when there's no document to key on.
		#sizeKey() {
			const doc = this.document;
			return doc?.documentName && doc?.type ? `${doc.documentName}.${doc.type}` : null;
		}

		setPosition(position) {
			const pos = super.setPosition(position);
			const size = SheetSize.fromObject(pos);
			if (size && this.#sizeKey()) this.#saveSize(size);
			return pos;
		}
	};
}
