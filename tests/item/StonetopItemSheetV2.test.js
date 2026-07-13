import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createStonetopItemSheetV2BaseClass } from "../../src/item/StonetopItemSheetV2.js";

// A lifecycle-faithful stand-in for ApplicationV2: run _initializeApplicationOptions, then FREEZE
// the options — proving the composed size-memory mixin injects the saved size pre-freeze.
class FakeItemSheetV2Base {
	constructor(options = {}) {
		this.options = Object.freeze(this._initializeApplicationOptions(options));
		this.position = { ...this.options.position };
		this.document = options.document;
	}
	_initializeApplicationOptions(options) {
		return { ...options, position: { width: 500, height: 400 } };
	}
}

describe("StonetopItemSheetV2 base", () => {
	beforeEach(() => {
		global.foundry.applications.api = { HandlebarsApplicationMixin: Base => Base };
		global.foundry.applications.sheets = { ItemSheetV2: FakeItemSheetV2Base };
		// The composed size-memory mixin defaults to the setting-backed singleton.
		global.game.settings = {
			get: vi.fn(() => ({ "Item.move": { width: 900, height: 750 } })),
			set: vi.fn(),
		};
	});
	afterEach(() => {
		delete global.foundry.applications.api;
		delete global.foundry.applications.sheets;
		delete global.game.settings;
	});

	it("declares the item-sheet defaults: stonetop classes, resizable, submitOnChange", () => {
		const Sheet = createStonetopItemSheetV2BaseClass();
		// V2 defaults submitOnChange AND closeOnSubmit to false — without this opt-in,
		// name="system.x" inputs would never save.
		expect(Sheet.DEFAULT_OPTIONS.form.submitOnChange).toBe(true);
		expect(Sheet.DEFAULT_OPTIONS.classes).toEqual(["stonetop", "sheet", "item"]);
		expect(Sheet.DEFAULT_OPTIONS.window.resizable).toBe(true);
	});

	it("composes the size-memory mixin: a saved size lands in the frozen options", () => {
		const Sheet = createStonetopItemSheetV2BaseClass();
		const sheet = new Sheet({ document: { documentName: "Item", type: "move" } });
		expect(sheet.options.position).toMatchObject({ width: 900, height: 750 });
	});

	it("keeps the base default size when nothing is saved for the type", () => {
		global.game.settings.get = vi.fn(() => ({}));
		const Sheet = createStonetopItemSheetV2BaseClass();
		const sheet = new Sheet({ document: { documentName: "Item", type: "arcanum" } });
		expect(sheet.options.position).toMatchObject({ width: 500, height: 400 });
	});
});
