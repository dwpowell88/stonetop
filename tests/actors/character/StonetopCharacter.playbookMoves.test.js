import {describe, it, expect, afterEach, vi} from "vitest";
import {StonetopCharacter} from "../../../src/actors/character/StonetopCharacter.js";
import {FoundryRepositoryFactory} from "../../../src/actors/character/repositories/FoundryRepositoryFactory.js";
import {StonetopPlaybook} from "../../../src/item/StonetopPlaybook.js";
import {FakeGameBuilder} from "../../fakes/FakeGameBuilder.js";
import {FakeCharacterActorBuilder} from "../../fakes/FakeCharacterActorBuilder.js";
import {FakePackBuilder} from "../../fakes/foundry/FakePackBuilder.js";
import {FakeCompendiumMoveBuilder} from "../../fakes/FakeCompendiumMoveBuilder.js";

// Integration test: real StonetopCharacter + real FoundryRepositoryFactory/repositories +
// real StonetopPlaybook. Only the Foundry boundary is faked (game.packs via FakeGameBuilder,
// the actor via FakeCharacterActorBuilder). This exercises the full drop→select→buildSnapshot wiring that
// unit tests (which mock the move repo) miss — e.g. StonetopPlaybook failing to surface `moves`.

// A dropped playbook item exposes asPlaybook() → StonetopPlaybook (the real domain wrapper).
function playbookItem(system = {}) {
	const item = {
		_id: "pb1", type: "playbook", name: "The Blessed",
		system: {
			slug: "the-blessed", startingMovesNote: null, backgrounds: [],
			followers: [], inserts: [], specialPossessions: null, ...system,
		},
		asPlaybook() { return new StonetopPlaybook(this); },
	};
	return item;
}

function withMovesPack(...moves) {
	const pack = FakePackBuilder.movesPack();
	for (const m of moves) pack.withItem(m);
	new FakeGameBuilder().withPack(pack).build();
}

function move(name) { return new FakeCompendiumMoveBuilder().withName(name).build(); }

describe("StonetopCharacter — playbook moves auto-populate on the moves tab (integration)", () => {
	afterEach(() => vi.unstubAllGlobals());

	it("playbook moves appear in the moves tab after selecting a playbook", async () => {
		withMovesPack(move("Serenity"), move("Invoke the Gods"));
		const character = new StonetopCharacter(new FakeCharacterActorBuilder().build(), new FoundryRepositoryFactory());

		await character._onCreateDescendantDocuments([
			playbookItem({ moves: ["serenity", "invoke-the-gods"], startingMoves: ["serenity"] }),
		]);

		const cat = (await character.buildSnapshot()).moves.categories.find(c => c.key === "playbook-the-blessed");
		expect(cat).toBeDefined();
		expect(cat.moves.map(m => m.name).sort()).toEqual(["Invoke the Gods", "Serenity"]);
	});

	it("startingMoves seed acquired; the rest seed un-acquired", async () => {
		withMovesPack(move("Serenity"), move("Invoke the Gods"));
		const character = new StonetopCharacter(new FakeCharacterActorBuilder().build(), new FoundryRepositoryFactory());

		await character._onCreateDescendantDocuments([
			playbookItem({ moves: ["serenity", "invoke-the-gods"], startingMoves: ["serenity"] }),
		]);

		const cat = (await character.buildSnapshot()).moves.categories.find(c => c.key === "playbook-the-blessed");
		expect(cat.moves.find(m => m.name === "Serenity").selection.value).toBe(1);
		expect(cat.moves.find(m => m.name === "Invoke the Gods").selection.value).toBe(0);
	});

	it("inserts still add their moves to the moves tab", async () => {
		withMovesPack(move("Haunt"));
		const character = new StonetopCharacter(new FakeCharacterActorBuilder().build(), new FoundryRepositoryFactory());

		await character._onCreateDescendantDocuments([
			{ _id: "in1", type: "insert", name: "Revenant",
				system: { slug: "revenant", moves: ["haunt"], startingMoves: ["haunt"], choices: [], instinct: null } },
		]);

		const cat = (await character.buildSnapshot()).moves.categories.find(c => c.key === "insert-revenant");
		expect(cat?.moves.map(m => m.name)).toContain("Haunt");
	});
});
