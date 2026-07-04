import { describe, it, expect, vi, afterEach } from "vitest";
import { createStonetopCharacterSheetClass } from "../../../src/actors/character/StonetopCharacterSheet.js";
import {FakeCharacterActorBuilder} from "../../fakes/FakeCharacterActorBuilder.js";

// -- Helpers ------------------------------------------------------------------

function makeCharacterMock(actor) {
	const background = {
		selectBackground: vi.fn(async slug => actor.setFlag("stonetop", "background.selected", slug)),
		addChoice: vi.fn(),
		selectedSlug: actor.getFlag("stonetop", "background.selected") ?? "",
		choices: {},
	};
	const instinct = { select: vi.fn(), selectedValue: "" };
	const appearance = {
		selectOption: vi.fn(),
	};
	const origin = { select: vi.fn(), selectName: vi.fn() };
	return {
		background,
		instinct,
		appearance,
		origin,
		selectBackground: vi.fn(),
		onDropItems: vi.fn(async () => ({ anyAdded: false, others: [] })),
		updateName: vi.fn(async name => actor.update({ name })),
		addMove: vi.fn(),
		removeMove: vi.fn(),
		addArcanum: vi.fn(async () => {}),
		onDropMove: vi.fn(async () => false),
		moveResources: { add: vi.fn() },
		buildSnapshot: vi.fn(async () => ({})),
		removeArcanum: vi.fn(async () => {}),
		removeFollower: vi.fn(async () => {}),
		deleteMove: vi.fn(async () => {}),
		deletePossession: vi.fn(async () => {}),
		removeCustomInventoryItem: vi.fn(async () => {}),
		removeFollowerInvCustomItem: vi.fn(async () => {}),
	};
}

function makeActor() {
	const actor = new FakeCharacterActorBuilder().build();
	actor.typedActor = makeCharacterMock(actor);
	return actor;
}

function makeSheet(actor) {
	const Base = class {
		constructor() { this._actor = actor; }
		get actor() { return this._actor; }
		get isEditable() { return true; }
		async getData() { return {}; }
		activateListeners() {}
		render = vi.fn();
		async _onDropItemCreate() {}
	};
	const Sheet = createStonetopCharacterSheetClass(Base);
	return new Sheet();
}

// -- Event handler tests ------------------------------------------------------

// -- Item fixtures ------------------------------------------------------------

function makeArcanum(slug = "humble-broom") {
	return { type: "move", system: { moveType: "arcanum" }, flags: { stonetop: { slug } } };
}

function makeMove() {
	return { type: "move", system: { moveType: "basic" }, flags: {} };
}

function makeNonMove() {
	return { type: "arcanum", system: {}, flags: {} };
}

// -- Tests --------------------------------------------------------------------

describe("StonetopCharacterSheet event handlers", () => {
	it("_onBackgroundChange calls selectBackground with the slug", async () => {
		const actor = makeActor();
		const sheet = makeSheet(actor);
		await sheet._onBackgroundChange({ currentTarget: { value: "vessel" } });
		expect(actor.typedActor.selectBackground).toHaveBeenCalledWith("vessel");
	});

	it("_onOriginNameClick calls origin.selectName with trimmed text", async () => {
		const actor = makeActor();
		const sheet = makeSheet(actor);
		await sheet._onOriginNameClick({ currentTarget: { textContent: "  Arwel  " } });
		expect(actor.typedActor.origin.selectName).toHaveBeenCalledWith("Arwel");
	});
});

describe("StonetopCharacterSheet._onDropItemCreate", () => {
	it("passes items array to onDropItems", async () => {
		const actor = makeActor();
		const sheet = makeSheet(actor);
		const items = [makeArcanum("humble-broom"), makeMove()];
		await sheet._onDropItemCreate(items);
		expect(actor.typedActor.onDropItems).toHaveBeenCalledWith(items);
	});

	it("wraps a single item in an array for onDropItems", async () => {
		const actor = makeActor();
		const sheet = makeSheet(actor);
		const item = makeArcanum("humble-broom");
		await sheet._onDropItemCreate(item);
		expect(actor.typedActor.onDropItems).toHaveBeenCalledWith([item]);
	});

	it("does not call render explicitly — Foundry re-renders after document mutation", async () => {
		const actor = makeActor();
		const sheet = makeSheet(actor);
		actor.typedActor.onDropItems.mockResolvedValue({ anyAdded: true, others: [] });
		await sheet._onDropItemCreate(makeArcanum("humble-broom"));
		expect(sheet.render).not.toHaveBeenCalled();
	});
});

// -- Delete confirmation ------------------------------------------------------

describe("StonetopCharacterSheet delete confirmation", () => {
	afterEach(() => vi.unstubAllGlobals());

	function stubConfirm(result) {
		const confirm = vi.fn(async () => result);
		vi.stubGlobal("Dialog", { confirm });
		vi.stubGlobal("game", { i18n: { localize: k => k, format: k => k } });
		return confirm;
	}

	// Each row: the handler under test, the dataset it receives, and the typed-actor method it must
	// (or must not) call. Covers all five destructive deletes on the character sheet.
	const cases = [
		["_onDeleteArcanum",   { slug: "azure-hand", name: "Azure Hand" }, "removeArcanum"],
		["_onDeleteFollower",  { slug: "astor",      name: "Astor" },      "removeFollower"],
		["_onDeleteOtherMove", { moveSlug: "cleave", name: "Cleave" },     "deleteMove"],
	];

	for (const [handler, dataset, method] of cases) {
		it(`${handler} deletes when confirmed`, async () => {
			stubConfirm(true);
			const actor = makeActor();
			const sheet = makeSheet(actor);
			await sheet[handler](dataset);
			expect(actor.typedActor[method]).toHaveBeenCalledTimes(1);
		});

		it(`${handler} does nothing when cancelled`, async () => {
			stubConfirm(false);
			const actor = makeActor();
			const sheet = makeSheet(actor);
			await sheet[handler](dataset);
			expect(actor.typedActor[method]).not.toHaveBeenCalled();
		});

		it(`${handler} skips the confirm dialog on skipConfirm`, async () => {
			const confirm = stubConfirm(false);
			const actor = makeActor();
			const sheet = makeSheet(actor);
			await sheet[handler](dataset, { skipConfirm: true });
			expect(confirm).not.toHaveBeenCalled();
			expect(actor.typedActor[method]).toHaveBeenCalledTimes(1);
		});
	}

	it("_onDeletePossession deletes when confirmed", async () => {
		stubConfirm(true);
		const actor = makeActor();
		const sheet = makeSheet(actor);
		await sheet._onDeletePossession({ currentTarget: { dataset: { slug: "map", name: "Map" } } });
		expect(actor.typedActor.deletePossession).toHaveBeenCalledWith("map");
	});

	it("_onDeletePossession does nothing when cancelled", async () => {
		stubConfirm(false);
		const actor = makeActor();
		const sheet = makeSheet(actor);
		await sheet._onDeletePossession({ currentTarget: { dataset: { slug: "map", name: "Map" } } });
		expect(actor.typedActor.deletePossession).not.toHaveBeenCalled();
	});

	it("_onDeleteCustomInventoryItem deletes when confirmed", async () => {
		stubConfirm(true);
		const actor = makeActor();
		const sheet = makeSheet(actor);
		await sheet._onDeleteCustomInventoryItem({ currentTarget: { dataset: { ownedId: "x1", name: "Rope" } } });
		expect(actor.typedActor.removeCustomInventoryItem).toHaveBeenCalledWith("x1");
	});

	it("_onDeleteCustomInventoryItem does nothing when cancelled", async () => {
		stubConfirm(false);
		const actor = makeActor();
		const sheet = makeSheet(actor);
		await sheet._onDeleteCustomInventoryItem({ currentTarget: { dataset: { ownedId: "x1", name: "Rope" } } });
		expect(actor.typedActor.removeCustomInventoryItem).not.toHaveBeenCalled();
	});

	it("_onDeleteCustomInventoryItem skips the confirm dialog on skipConfirm", async () => {
		const confirm = stubConfirm(false);
		const actor = makeActor();
		const sheet = makeSheet(actor);
		await sheet._onDeleteCustomInventoryItem({ currentTarget: { dataset: { ownedId: "x1", name: "Rope" } } }, { skipConfirm: true });
		expect(confirm).not.toHaveBeenCalled();
		expect(actor.typedActor.removeCustomInventoryItem).toHaveBeenCalledWith("x1");
	});
});
