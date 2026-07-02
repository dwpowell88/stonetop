import {describe, it, expect, afterEach, vi} from "vitest";
import {StonetopCharacter} from "../../../src/actors/character/StonetopCharacter.js";
import {FoundryRepositoryFactory} from "../../../src/actors/character/repositories/FoundryRepositoryFactory.js";
import {FakeGameBuilder} from "../../fakes/FakeGameBuilder.js";
import {FakeCharacterActorBuilder} from "../../fakes/FakeCharacterActorBuilder.js";
import {FakePackBuilder} from "../../fakes/foundry/FakePackBuilder.js";
import {FakeCompendiumMoveBuilder} from "../../fakes/FakeCompendiumMoveBuilder.js";

// Integration test: real StonetopCharacter + real FoundryRepositoryFactory/repositories +
// real CharacterArcana/CharacterMoves. Only the Foundry boundary is faked. This exercises the full
// drop→onArcanumCreated→buildSnapshot wiring: a major arcanum's mystery moves are registered as real
// `move` items in an `arcana-<slug>` category, rendered on the card, tickable, and kept off the moves tab.

function move(name) { return new FakeCompendiumMoveBuilder().withName(name).build(); }

function withMovesPack(...moves) {
	const pack = FakePackBuilder.movesPack();
	for (const m of moves) pack.withItem(m);
	new FakeGameBuilder().withPack(pack).build();
}

// A dropped major arcanum item: its back references mystery moves by slug (back.moveSlugs).
function majorArcanumItem(moveSlugs) {
	return {
		_id: "arc1", type: "arcanum", name: "Azure Hand",
		system: {
			slug: "azure-hand", major: true, flipped: true,
			front: { title: "Azure Hand", description: null, item: null, unlock: null },
			back:  { title: "Mysteries", description: "the back", moveSlugs },
			unlockValues: {}, backChoiceValues: {},
		},
	};
}

// Faithful to the real drop flow: Foundry first creates the embedded arcanum item, THEN fires the
// create-descendant hook with that document. Build the actor with the item already embedded, then drive
// the hook against the same object.
function characterWithArcanum(arcanumItem) {
	return new StonetopCharacter(
		new FakeCharacterActorBuilder().addItem(arcanumItem).build(), new FoundryRepositoryFactory(),
	);
}

async function arcanaCard(character, slug) {
	const snap = await character.buildSnapshot();
	return snap.arcana.major.items.find(c => c.slug === slug);
}

describe("StonetopCharacter — major arcana mystery moves render as real moves (integration)", () => {
	afterEach(() => vi.unstubAllGlobals());

	it("a dropped major arcanum's mystery moves appear on its card, seeded un-acquired", async () => {
		withMovesPack(move("Battery"), move("Resonance"));
		const arcanum = majorArcanumItem(["battery", "resonance"]);
		const character = characterWithArcanum(arcanum);

		await character._onCreateDescendantDocuments([arcanum]);

		const card = await arcanaCard(character, "azure-hand");
		expect(card).toBeDefined();
		expect(card.back.moves.map(m => m.name).sort()).toEqual(["Battery", "Resonance"]);
		for (const m of card.back.moves) expect(m.selection.value).toBe(0);
		for (const m of card.back.moves) expect(m.selectable).toBe(true);
	});

	it("ticking a mystery move marks it acquired", async () => {
		withMovesPack(move("Battery"), move("Resonance"));
		const arcanum = majorArcanumItem(["battery", "resonance"]);
		const character = characterWithArcanum(arcanum);

		await character._onCreateDescendantDocuments([arcanum]);
		await character.incrementMove("arcana-azure-hand", "battery");

		const card = await arcanaCard(character, "azure-hand");
		expect(card.back.moves.find(m => m.name === "Battery").selection.value).toBe(1);
		expect(card.back.moves.find(m => m.name === "Resonance").selection.value).toBe(0);
	});

	it("an acquired rollable mystery move exposes its rollStat and owned move id", async () => {
		// The shared move-row wrapper renders `.item[data-item-id]` only when an acquired move has a
		// rollStat, so the sheet's roll handler resolves the OWNED move item (full description + result
		// tiers) rather than falling back to a bare stat roll. Guard that the card snapshot carries both.
		const resonance = new FakeCompendiumMoveBuilder().withName("Resonance").withRollStat("int")
			.withMoveResults({ success: { label: "10+", value: "it comes to pass" },
				partial: { label: "7-9", value: "mark a consequence" }, failure: { label: "6-", value: "" } }).build();
		withMovesPack(resonance, move("Battery"));
		const arcanum = majorArcanumItem(["battery", "resonance"]);
		const character = characterWithArcanum(arcanum);

		await character._onCreateDescendantDocuments([arcanum]);
		await character.incrementMove("arcana-azure-hand", "resonance");

		const card = await arcanaCard(character, "azure-hand");
		const move_ = card.back.moves.find(m => m.name === "Resonance");
		expect(move_.selection.value).toBe(1);
		expect(move_.rollStat).toBe("int");
		expect(move_.ownedId).toBeTruthy();
	});

	it("arcana mystery moves do not leak onto the moves tab", async () => {
		withMovesPack(move("Battery"), move("Resonance"));
		const arcanum = majorArcanumItem(["battery", "resonance"]);
		const character = characterWithArcanum(arcanum);

		await character._onCreateDescendantDocuments([arcanum]);

		const snap = await character.buildSnapshot();
		// No arcana category, and the mystery moves appear in NO moves-tab category (not even "other").
		expect(snap.moves.categories.find(c => c.key === "arcana-azure-hand")).toBeUndefined();
		const tabMoveNames = snap.moves.categories.flatMap(c => c.moves.map(m => m.name));
		expect(tabMoveNames).not.toContain("Battery");
		expect(tabMoveNames).not.toContain("Resonance");
	});

	it("removing the arcanum removes its mystery-move category", async () => {
		withMovesPack(move("Battery"), move("Resonance"));
		const arcanum = majorArcanumItem(["battery", "resonance"]);
		const character = characterWithArcanum(arcanum);

		await character._onCreateDescendantDocuments([arcanum]);
		await character.removeArcanum("azure-hand");

		const snap = await character.buildSnapshot();
		expect(snap.arcana.major.items.find(c => c.slug === "azure-hand")).toBeUndefined();
		expect(snap.moves.categories.find(c => c.key === "arcana-azure-hand")).toBeUndefined();
	});
});
