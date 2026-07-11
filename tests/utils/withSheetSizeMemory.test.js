import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { withSheetSizeMemory } from "../../src/utils/withSheetSizeMemory.js";
import { SheetSize } from "../../src/utils/SheetSize.js";

// A minimal stand-in for a Foundry Application sheet base: seeds options/position from defaults and
// exposes the document the mixin keys on. setPosition merges + echoes the resulting position.
function makeBase(defaults = { width: 800, height: 600 }) {
	return class FakeSheetBase {
		constructor(document) {
			this.document = document;
			this.options = { ...defaults };
			this.position = { ...defaults };
		}
		setPosition(position) {
			Object.assign(this.position, position);
			return { ...this.position };
		}
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

describe("withSheetSizeMemory", () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it("applies a saved size on construction (options and position)", () => {
		const memory = fakeMemory({ "Actor.character": new SheetSize(1000, 700) });
		const Sheet = withSheetSizeMemory(makeBase(), memory);

		const sheet = new Sheet(characterDoc);

		expect(sheet.position).toMatchObject({ width: 1000, height: 700 });
		expect(sheet.options).toMatchObject({ width: 1000, height: 700 });
	});

	it("leaves the base defaults untouched when nothing is saved", () => {
		const memory = fakeMemory();
		const Sheet = withSheetSizeMemory(makeBase({ width: 800, height: 600 }), memory);

		const sheet = new Sheet(characterDoc);

		expect(sheet.position).toMatchObject({ width: 800, height: 600 });
		expect(sheet.options).toMatchObject({ width: 800, height: 600 });
	});

	it("saves the size (debounced) when setPosition runs", () => {
		const memory = fakeMemory();
		const Sheet = withSheetSizeMemory(makeBase(), memory);
		const sheet = new Sheet(characterDoc);

		sheet.setPosition({ width: 1200, height: 900 });
		expect(memory.saved).toHaveLength(0); // debounced — not yet
		vi.advanceTimersByTime(500);

		expect(memory.saved).toHaveLength(1);
		const [key, size] = memory.saved[0];
		expect(key).toBe("Actor.character");
		expect(size.toObject()).toEqual({ width: 1200, height: 900 });
	});

	it("debounces rapid setPosition calls into a single save of the last size", () => {
		const memory = fakeMemory();
		const Sheet = withSheetSizeMemory(makeBase(), memory);
		const sheet = new Sheet(characterDoc);

		sheet.setPosition({ width: 1000, height: 700 });
		sheet.setPosition({ width: 1100, height: 800 });
		sheet.setPosition({ width: 1200, height: 900 });
		vi.advanceTimersByTime(500);

		expect(memory.saved).toHaveLength(1);
		expect(memory.saved[0][1].toObject()).toEqual({ width: 1200, height: 900 });
	});

	it("does not save when setPosition yields no concrete size (e.g. width 'auto')", () => {
		const memory = fakeMemory();
		const Sheet = withSheetSizeMemory(makeBase({ width: "auto", height: "auto" }), memory);
		const sheet = new Sheet(characterDoc);

		sheet.setPosition({ left: 10, top: 20 });
		vi.advanceTimersByTime(500);

		expect(memory.saved).toHaveLength(0);
	});

	it("returns the base setPosition result unchanged", () => {
		const memory = fakeMemory();
		const Sheet = withSheetSizeMemory(makeBase(), memory);
		const sheet = new Sheet(characterDoc);

		const result = sheet.setPosition({ width: 1200, height: 900 });
		expect(result).toMatchObject({ width: 1200, height: 900 });
	});

	it("neither applies nor saves a size when there is no document to key on", () => {
		const memory = fakeMemory({ "Actor.character": new SheetSize(1000, 700) });
		const Sheet = withSheetSizeMemory(makeBase(), memory);

		const sheet = new Sheet(undefined); // no document

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
		const Sheet = withSheetSizeMemory(makeBase(), memory);

		const character = new Sheet({ documentName: "Actor", type: "character" });
		const follower = new Sheet({ documentName: "Item", type: "follower" });

		expect(character.position).toMatchObject({ width: 1000, height: 700 });
		expect(follower.position).toMatchObject({ width: 940, height: 760 });
	});
});
