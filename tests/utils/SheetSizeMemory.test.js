import { describe, it, expect } from "vitest";
import { SheetSizeMemory } from "../../src/utils/SheetSizeMemory.js";
import { SheetSize } from "../../src/utils/SheetSize.js";

// A fake for the injected client-setting backing.
function fakeBacking(initial = {}) {
	let stored = initial;
	return {
		read: () => stored,
		write: (map) => { stored = map; },
		peek: () => stored,
	};
}

describe("SheetSizeMemory", () => {
	it("returns null for an unknown key", () => {
		const memory = new SheetSizeMemory(fakeBacking());
		expect(memory.get("Actor.character")).toBeNull();
	});

	it("stores and retrieves a size for a key", () => {
		const memory = new SheetSizeMemory(fakeBacking());
		memory.set("Actor.character", new SheetSize(1000, 700));

		const got = memory.get("Actor.character");
		expect(got).toBeInstanceOf(SheetSize);
		expect(got.toObject()).toEqual({ width: 1000, height: 700 });
	});

	it("keeps sizes for other keys untouched when setting one", () => {
		const backing = fakeBacking({ "Item.follower": { width: 940, height: 760 } });
		const memory = new SheetSizeMemory(backing);

		memory.set("Actor.character", new SheetSize(1000, 700));

		expect(memory.get("Item.follower").toObject()).toEqual({ width: 940, height: 760 });
		expect(memory.get("Actor.character").toObject()).toEqual({ width: 1000, height: 700 });
	});

	it("persists plain objects (not class instances) into the backing", () => {
		const backing = fakeBacking();
		const memory = new SheetSizeMemory(backing);
		memory.set("Actor.character", new SheetSize(1000, 700));
		expect(backing.peek()).toEqual({ "Actor.character": { width: 1000, height: 700 } });
	});

	it("returns null when the stored value is invalid", () => {
		const memory = new SheetSizeMemory(fakeBacking({ "Actor.character": { width: "auto", height: 700 } }));
		expect(memory.get("Actor.character")).toBeNull();
	});
});
