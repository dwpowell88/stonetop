import { describe, it, expect, vi, afterEach } from "vitest";
import { SteadingImprovements } from "../../../src/actors/steading/SteadingImprovements.js";
import { FoundrySteadingImprovementRepository } from "../../../src/actors/steading/repositories/FoundrySteadingImprovementRepository.js";

// End-to-end: the REAL improvement repository (compendium + world) feeding the REAL SteadingImprovements
// snapshot builder (real ChoiceGroup.fromPackData). Only the Foundry game boundary (packs + items) is
// mocked — this proves a custom improvement authored in the world actually surfaces on a steading.

function packEntry(slug, sortOrder, choices) {
	return { _id: `pack-${slug}`, name: slug, type: "improvement", system: { slug, sortOrder, choices } };
}

function worldEntry(slug, sortOrder, choices) {
	const obj = { _id: `world-${slug}`, name: slug, type: "improvement", system: { slug, sortOrder, choices } };
	return { type: "improvement", toObject: () => obj };
}

function stubGame(packEntries, worldEntries) {
	vi.stubGlobal("game", {
		packs: { get: () => ({ getIndex: async () => {}, index: packEntries, folders: [] }) },
		items: { contents: worldEntries },
	});
}

function makeActor(pickValues = {}) {
	const actor = { system: { improvements: { pickValues } }, update: vi.fn(async () => {}) };
	return actor;
}

const WATCHTOWER = {
	slug: "watchtower",
	list: [{ type: "entry", slug: "built", content: { title: "Watchtower", text: "Keep the watch." }, track: { max: 2 } }],
};

describe("Steading improvements — custom world improvement (integration)", () => {
	afterEach(() => vi.unstubAllGlobals());

	it("surfaces a world-authored improvement in the snapshot, sorted with the built-ins", async () => {
		stubGame(
			[packEntry("inn", 1, { slug: "inn", list: [] })],
			[worldEntry("watchtower", 2, WATCHTOWER)],
		);
		const improvements = new SteadingImprovements(makeActor(), new FoundrySteadingImprovementRepository());
		const snap = await improvements.buildSnapshot();

		expect(snap.map(g => g.slug)).toEqual(["inn", "watchtower"]);
		const watchtower = snap[1];
		expect(watchtower.list[0].track.checks).toEqual([false, false]);
	});

	it("reflects a stored track value on the custom improvement's group", async () => {
		stubGame([], [worldEntry("watchtower", 1, WATCHTOWER)]);
		const actor = makeActor({ watchtower: { built: 1 } });
		const improvements = new SteadingImprovements(actor, new FoundrySteadingImprovementRepository());
		const snap = await improvements.buildSnapshot();

		expect(snap[0].list[0].track.checks).toEqual([true, false]);
	});

	it("writes a track change back through setTrack for a custom improvement", async () => {
		stubGame([], [worldEntry("watchtower", 1, WATCHTOWER)]);
		const actor = makeActor();
		const improvements = new SteadingImprovements(actor, new FoundrySteadingImprovementRepository());
		await improvements.setTrack("watchtower", "built", 2);

		expect(actor.update).toHaveBeenCalledWith({
			"system.improvements.pickValues": { watchtower: { built: 2 } },
		});
	});
});
