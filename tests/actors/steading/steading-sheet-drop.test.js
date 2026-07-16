import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the applySteadfast module so we can assert the drop routes a steadfast to it (and only it).
vi.mock("../../../src/actors/steading/applySteadfast.js", () => ({
	applySteadfast:    vi.fn(async () => {}),
	loadSteadfast:     vi.fn(async () => null),
	loadAllSteadfasts: vi.fn(async () => []),
	matchSteadfastByName: vi.fn(() => null),
}));

import { createStonetopSteadingSheetClass } from "../../../src/actors/steading/StonetopSteadingSheet.js";
import { applySteadfast } from "../../../src/actors/steading/applySteadfast.js";

// A minimal V2 base — the sheet wires its own drop listener (V2 sheets have no built-in DragDrop),
// so the base only needs to satisfy the constructor (typedActor + tabGroups).
class FakeBase {
	constructor(actor) { this.actor = actor; }
	tabGroups = {};
}

const StonetopSteadingSheet = createStonetopSteadingSheetClass(FakeBase);

function makeSheet({ editable = true } = {}) {
	const actor = {
		typedActor: {}, name: "Stonetop", system: { steadfast: "" },
		createEmbeddedDocuments: vi.fn(async () => {}),
	};
	const sheet = new StonetopSteadingSheet(actor);
	sheet.isEditable = editable;
	return sheet;
}

describe("StonetopSteadingSheet._onDrop", () => {
	beforeEach(() => {
		vi.stubGlobal("foundry", {
			applications: { ux: { TextEditor: { implementation: {
				getDragEventData: vi.fn(() => ({ type: "Item", uuid: "x" })),
			} } } },
		});
		vi.stubGlobal("Item", { implementation: { fromDropData: vi.fn() } });
		applySteadfast.mockClear();
	});
	afterEach(() => vi.unstubAllGlobals());

	it("applies a dropped steadfast to the steading instead of embedding it", async () => {
		const steadfast = { type: "steadfast", name: "Barrier Pass", system: { slug: "barrier-pass" }, toObject: () => ({}) };
		Item.implementation.fromDropData.mockResolvedValue(steadfast);
		const sheet = makeSheet();

		await sheet._onDrop({});

		expect(applySteadfast).toHaveBeenCalledWith(sheet.actor, steadfast);
		expect(sheet.actor.createEmbeddedDocuments).not.toHaveBeenCalled();
	});

	it("embeds a non-steadfast item as a normal owned item", async () => {
		const move = { type: "move", name: "Sneak", toObject: () => ({ type: "move", name: "Sneak" }) };
		Item.implementation.fromDropData.mockResolvedValue(move);
		const sheet = makeSheet();

		await sheet._onDrop({});

		expect(applySteadfast).not.toHaveBeenCalled();
		expect(sheet.actor.createEmbeddedDocuments).toHaveBeenCalledWith("Item", [{ type: "move", name: "Sneak" }]);
	});

	it("does nothing when the sheet is not editable", async () => {
		Item.implementation.fromDropData.mockResolvedValue({ type: "steadfast", system: { slug: "x" }, toObject: () => ({}) });
		const sheet = makeSheet({ editable: false });

		await sheet._onDrop({});

		expect(applySteadfast).not.toHaveBeenCalled();
		expect(sheet.actor.createEmbeddedDocuments).not.toHaveBeenCalled();
	});

	it("ignores a non-Item drag payload", async () => {
		foundry.applications.ux.TextEditor.implementation.getDragEventData.mockReturnValue({ type: "Actor" });
		const sheet = makeSheet();

		await sheet._onDrop({});

		expect(Item.implementation.fromDropData).not.toHaveBeenCalled();
		expect(applySteadfast).not.toHaveBeenCalled();
	});
});
