import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { withSheetSizeMemoryV2 } from "../../src/utils/withSheetSizeMemoryV2.js";
import { SheetSize } from "../../src/utils/SheetSize.js";

// A minimal stand-in for ApplicationV2's DocumentSheetV2 lifecycle: the constructor runs
// _initializeApplicationOptions (where subclasses may still mutate options) and then FREEZES the
// result, exactly like the real class — so these tests fail if the mixin tries the V1 trick of
// mutating this.options after construction. setPosition merges and then fires the _onPosition hook
// with the full merged position, matching ApplicationV2.setPosition.
function makeBase(defaults = { width: 800, height: 600 }) {
	return class FakeV2SheetBase {
		constructor(options = {}) {
			this.options = Object.freeze(this._initializeApplicationOptions(options));
			this.position = { ...this.options.position };
			this.document = options.document;
		}
		_initializeApplicationOptions(options) {
			return { ...options, position: { ...defaults } };
		}
		setPosition(position) {
			Object.assign(this.position, position);
			this._onPosition({ ...this.position });
			return { ...this.position };
		}
		_onPosition(_position) {}
	};
}

// A fake SheetSizeMemory: seedable, and records set() calls.
function fakeMemory(initial = {}) {
	return {
		store: { ...initial },
		saved: [],
		get(key) { return this.store[key] ?? null; },
		set(key, size) { this.saved.push([key, size]); this.store[key] = size; },
	};
}

const characterDoc = { documentName: "Actor", type: "character" };

describe("withSheetSizeMemoryV2", () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it("applies a saved size to the (frozen) options and position on construction", () => {
		const memory = fakeMemory({ "Actor.character": new SheetSize(1000, 700) });
		const Sheet = withSheetSizeMemoryV2(makeBase(), memory);

		const sheet = new Sheet({ document: characterDoc });

		expect(sheet.options.position).toMatchObject({ width: 1000, height: 700 });
		expect(sheet.position).toMatchObject({ width: 1000, height: 700 });
	});

	it("leaves the base defaults untouched when nothing is saved", () => {
		const memory = fakeMemory();
		const Sheet = withSheetSizeMemoryV2(makeBase({ width: 800, height: 600 }), memory);

		const sheet = new Sheet({ document: characterDoc });

		expect(sheet.options.position).toMatchObject({ width: 800, height: 600 });
		expect(sheet.position).toMatchObject({ width: 800, height: 600 });
	});

	it("saves the size (debounced) when the position changes", () => {
		const memory = fakeMemory();
		const Sheet = withSheetSizeMemoryV2(makeBase(), memory);
		const sheet = new Sheet({ document: characterDoc });

		sheet.setPosition({ width: 1200, height: 900 });
		expect(memory.saved).toHaveLength(0); // debounced — not yet
		vi.advanceTimersByTime(500);

		expect(memory.saved).toHaveLength(1);
		const [key, size] = memory.saved[0];
		expect(key).toBe("Actor.character");
		expect(size.toObject()).toEqual({ width: 1200, height: 900 });
	});

	it("debounces rapid position changes into a single save of the last size", () => {
		const memory = fakeMemory();
		const Sheet = withSheetSizeMemoryV2(makeBase(), memory);
		const sheet = new Sheet({ document: characterDoc });

		sheet.setPosition({ width: 1000, height: 700 });
		sheet.setPosition({ width: 1100, height: 800 });
		sheet.setPosition({ width: 1200, height: 900 });
		vi.advanceTimersByTime(500);

		expect(memory.saved).toHaveLength(1);
		expect(memory.saved[0][1].toObject()).toEqual({ width: 1200, height: 900 });
	});

	it("does not save when the position has no concrete size (e.g. width 'auto')", () => {
		const memory = fakeMemory();
		const Sheet = withSheetSizeMemoryV2(makeBase({ width: "auto", height: "auto" }), memory);
		const sheet = new Sheet({ document: characterDoc });

		sheet.setPosition({ left: 10, top: 20 });
		vi.advanceTimersByTime(500);

		expect(memory.saved).toHaveLength(0);
	});

	it("still saves on a pure move, because _onPosition carries the full merged position", () => {
		const memory = fakeMemory();
		const Sheet = withSheetSizeMemoryV2(makeBase(), memory);
		const sheet = new Sheet({ document: characterDoc });

		sheet.setPosition({ left: 10, top: 20 }); // no width/height in the call…
		vi.advanceTimersByTime(500);

		expect(memory.saved).toHaveLength(1); // …but the merged position has the current size
		expect(memory.saved[0][1].toObject()).toEqual({ width: 800, height: 600 });
	});

	it("neither applies nor saves a size when there is no document to key on", () => {
		const memory = fakeMemory({ "Actor.character": new SheetSize(1000, 700) });
		const Sheet = withSheetSizeMemoryV2(makeBase(), memory);

		const sheet = new Sheet({}); // no document

		expect(sheet.position).toMatchObject({ width: 800, height: 600 }); // untouched
		sheet.setPosition({ width: 1200, height: 900 });
		vi.advanceTimersByTime(500);
		expect(memory.saved).toHaveLength(0);
	});

	it("keys per sheet type so different types don't collide", () => {
		const memory = fakeMemory({
			"Actor.character": new SheetSize(1000, 700),
			"Item.follower": new SheetSize(940, 760),
		});
		const Sheet = withSheetSizeMemoryV2(makeBase(), memory);

		const character = new Sheet({ document: { documentName: "Actor", type: "character" } });
		const follower = new Sheet({ document: { documentName: "Item", type: "follower" } });

		expect(character.position).toMatchObject({ width: 1000, height: 700 });
		expect(follower.position).toMatchObject({ width: 940, height: 760 });
	});
});
