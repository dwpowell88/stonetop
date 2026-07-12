import { describe, it, expect } from "vitest";
import { migrateFollowerItemType } from "../../src/migration/migrateCharacter.js";
import { FakeCharacterActorBuilder } from "../fakes/FakeCharacterActorBuilder.js";

function makeActor(items = []) {
	return new FakeCharacterActorBuilder().withItems(items).build();
}

describe("migrateFollowerItemType", () => {
	it("recreates legacy npc items as follower type and deletes the originals", async () => {
		const actor = makeActor([
			{
				_id: "n1", type: "npc", name: "Crew", img: "crew.png",
				system: { slug: "crew", owned: true, loyalty: { value: 2, max: 3 },
				          specialQuality: "Immune to fear", description: "A hardened band of veterans." },
				flags: { stonetop: { grantedByPlaybook: "the-marshal" } },
			},
			{ _id: "m1", type: "move", name: "Move", system: {} },
		]);

		await migrateFollowerItemType(actor);

		expect(actor.deletedIds).toEqual(["n1"]);
		expect(actor.createdDocs).toHaveLength(1);
		const created = actor.createdDocs[0];
		expect(created.type).toBe("follower");
		expect(created.name).toBe("Crew");
		expect(created.img).toBe("crew.png");
		expect(created.system.slug).toBe("crew");
		expect(created.system.loyalty).toEqual({ value: 2, max: 3 });
		// Prose stat-block fields survive the type change (whole system is copied).
		expect(created.system.specialQuality).toBe("Immune to fear");
		expect(created.system.description).toBe("A hardened band of veterans.");
		// Provenance flag (playbook grant) is preserved so the follower is still cleaned up on swap.
		expect(created.flags.stonetop.grantedByPlaybook).toBe("the-marshal");
	});

	it("leaves already-migrated follower items and other item types alone", async () => {
		const actor = makeActor([
			{ _id: "f1", type: "follower", name: "Enfys", system: { slug: "enfys" } },
			{ _id: "a1", type: "arcanum", name: "Arc", system: {} },
		]);
		await migrateFollowerItemType(actor);
		expect(actor.deletedIds).toHaveLength(0);
		expect(actor.createdDocs).toHaveLength(0);
	});

	it("is a no-op when the actor has no items", async () => {
		const actor = makeActor([]);
		await migrateFollowerItemType(actor);
		expect(actor.deletedIds).toHaveLength(0);
		expect(actor.createdDocs).toHaveLength(0);
	});
});
