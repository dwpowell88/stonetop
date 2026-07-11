import { describe, it, expect } from "vitest";
import { migrateArcanumChoiceGroupSlugs } from "../../src/migration/migrateCharacter.js";
import { FakeCharacterActorBuilder } from "../fakes/FakeCharacterActorBuilder.js";

function makeArcanumItem(slug, groupSlug) {
	const back = groupSlug === undefined
		? { title: "Back", choices: null }
		: { title: "Back", choices: { slug: groupSlug, list: [{ type: "entry", slug: "astor", followers: ["astor"] }] } };
	return {
		_id: slug, type: "arcanum", name: slug,
		system: { slug, major: true, front: {}, back, flipped: false, unlockValues: {}, backChoiceValues: {} },
	};
}

function makeActor(items = []) {
	return new FakeCharacterActorBuilder().withItems(items).build();
}

describe("migrateArcanumChoiceGroupSlugs", () => {
	it("rewrites a back-choices group slug that differs from the arcanum slug", async () => {
		const actor = makeActor([makeArcanumItem("blackwood-fetishes", "followers")]);
		await migrateArcanumChoiceGroupSlugs(actor);
		const updated = actor.updatedDocs.find(d => d._id === "blackwood-fetishes");
		expect(updated?.system?.back?.choices?.slug).toBe("blackwood-fetishes");
	});

	it("preserves the group's list while rewriting the slug", async () => {
		const actor = makeActor([makeArcanumItem("mindgem", "followers")]);
		await migrateArcanumChoiceGroupSlugs(actor);
		const updated = actor.updatedDocs.find(d => d._id === "mindgem");
		expect(updated?.system?.back?.choices?.list).toEqual([{ type: "entry", slug: "astor", followers: ["astor"] }]);
	});

	it("is a no-op when the group slug already matches the arcanum slug", async () => {
		const actor = makeActor([makeArcanumItem("cracked-flute", "cracked-flute")]);
		await migrateArcanumChoiceGroupSlugs(actor);
		expect(actor.updatedDocs).toHaveLength(0);
	});

	it("is a no-op for arcana without a back-choices group", async () => {
		const actor = makeActor([makeArcanumItem("humble-broom")]);
		await migrateArcanumChoiceGroupSlugs(actor);
		expect(actor.updatedDocs).toHaveLength(0);
	});

	it("ignores non-arcanum items", async () => {
		const actor = makeActor([{ _id: "n1", type: "follower", name: "Astor", system: { slug: "astor" } }]);
		await migrateArcanumChoiceGroupSlugs(actor);
		expect(actor.updatedDocs).toHaveLength(0);
	});

	it("repairs multiple mismatched arcana in one batch", async () => {
		const actor = makeActor([
			makeArcanumItem("blackwood-fetishes", "followers"),
			makeArcanumItem("mindgem", "followers"),
		]);
		await migrateArcanumChoiceGroupSlugs(actor);
		expect(actor.updatedDocs).toHaveLength(2);
	});
});
