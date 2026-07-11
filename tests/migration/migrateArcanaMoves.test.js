import { describe, expect, it } from "vitest";
import { migrateArcanaMoves } from "../../src/migration/migrateCharacter.js";
import { FakeCharacterActorBuilder } from "../fakes/FakeCharacterActorBuilder.js";
import { FakeArcanaRepository } from "../fakes/FakeArcanaRepository.js";
import { FakeMoveRepository } from "../fakes/FakeMoveRepository.js";
import { FakeCompendiumMoveBuilder } from "../fakes/FakeCompendiumMoveBuilder.js";

// migrateArcanaMoves(actor, arcanaRepo, moveRepo): existing embedded major arcana carry the legacy
// inline back.moves and no move category. The migration refreshes their `back` from the repo (so they
// gain back.moveSlugs) and registers the arcana-<slug> category of real move items.

const FRONT = { title: "Front", unlock: null, item: null, description: "desc" };

function makeActor(items = []) {
	return new FakeCharacterActorBuilder().withItems(items).build();
}

function mkMove(name) { return new FakeCompendiumMoveBuilder().withName(name).build(); }

function moveRepoWith(...names) {
	const repo = new FakeMoveRepository();
	for (const n of names) repo.addInsertMove(mkMove(n));
	return repo;
}

function legacyMajorArcanum() {
	return {
		_id: "arc1", type: "arcanum", name: "Azure Hand",
		system: {
			slug: "azure-hand", major: true,
			front: FRONT,
			back:  { title: "Mysteries", moves: [{ id: "battery", name: "Battery", text: "old inline" }] },
		},
	};
}

function repoWithMoveSlugs() {
	return new FakeArcanaRepository([{
		slug: "azure-hand", major: true, name: "Azure Hand",
		front: FRONT, back: { title: "Mysteries", moveSlugs: ["battery", "resonance"] },
	}]);
}

function arcanaCategoryItems(actor) {
	return [...actor.items].filter(i => i.type === "move" && i.system?.categoryKey === "arcana-azure-hand");
}

describe("migrateArcanaMoves", () => {
	it("refreshes a legacy major arcanum's back so it gains back.moveSlugs", async () => {
		const actor = makeActor([legacyMajorArcanum()]);
		await migrateArcanaMoves(actor, repoWithMoveSlugs(), moveRepoWith("Battery", "Resonance"));
		const arcanum = [...actor.items].find(i => i.system?.slug === "azure-hand");
		expect(arcanum.system.back.moveSlugs).toEqual(["battery", "resonance"]);
	});

	it("registers the arcana-<slug> move category of real move items, seeded un-acquired", async () => {
		const actor = makeActor([legacyMajorArcanum()]);
		await migrateArcanaMoves(actor, repoWithMoveSlugs(), moveRepoWith("Battery", "Resonance"));
		const moves = arcanaCategoryItems(actor);
		expect(moves.map(i => i.name).sort()).toEqual(["Battery", "Resonance"]);
		for (const m of moves) expect(m.system.acquired).toBe(false);
	});

	it("is re-run safe: a second pass adds no duplicate move items", async () => {
		const actor = makeActor([legacyMajorArcanum()]);
		await migrateArcanaMoves(actor, repoWithMoveSlugs(), moveRepoWith("Battery", "Resonance"));
		await migrateArcanaMoves(actor, repoWithMoveSlugs(), moveRepoWith("Battery", "Resonance"));
		expect(arcanaCategoryItems(actor)).toHaveLength(2);
	});

	it("leaves arcana without moveSlugs alone (minor/custom)", async () => {
		const minor = {
			_id: "arc2", type: "arcanum", name: "A Folktale",
			system: { slug: "a-folktale", major: false, front: FRONT, back: { title: "Back", moves: [] } },
		};
		const actor = makeActor([minor]);
		await migrateArcanaMoves(actor, new FakeArcanaRepository([{ slug: "a-folktale", front: FRONT, back: { title: "Back" } }]), moveRepoWith());
		expect([...actor.items].filter(i => i.type === "move")).toHaveLength(0);
	});

	it("does nothing when the actor has no arcanum items", async () => {
		const actor = makeActor([]);
		await migrateArcanaMoves(actor, repoWithMoveSlugs(), moveRepoWith("Battery", "Resonance"));
		expect([...actor.items]).toHaveLength(0);
	});
});
