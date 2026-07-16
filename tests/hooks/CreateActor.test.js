import { afterEach, describe, expect, it, vi } from "vitest";
import { onCreateActor } from "../../src/hooks/CreateActor.js";

// The create hook is where reference moves are seeded — once, on the creating client — instead of on
// every render. These tests pin that contract without pulling in the real pack/domain machinery: the
// document's `typedActor` is a stub whose `seedReferenceMoves` we spy on.

function stubGame(userId = "u1") {
	vi.stubGlobal("game", { user: { id: userId } });
}

// A character document skips the steading steadfast branch, so the hook's only job is the move seed.
function characterDoc(seedSpy) {
	return {
		type: "character",
		system: {},
		typedActor: { seedReferenceMoves: seedSpy },
	};
}

describe("onCreateActor — reference-move seeding", () => {
	afterEach(() => vi.unstubAllGlobals());

	it("seeds reference moves through the actor's typedActor on the creating client", async () => {
		stubGame("u1");
		const seed = vi.fn(async () => {});
		await onCreateActor(characterDoc(seed), {}, "u1");
		expect(seed).toHaveBeenCalledOnce();
	});

	it("does nothing when a different client created the actor", async () => {
		stubGame("u1");
		const seed = vi.fn(async () => {});
		await onCreateActor(characterDoc(seed), {}, "someone-else");
		expect(seed).not.toHaveBeenCalled();
	});

	it("skips actors with no reference-move seeding (e.g. NPCs) without throwing", async () => {
		stubGame("u1");
		const npcDoc = { type: "npc", system: {}, typedActor: {} };
		await expect(onCreateActor(npcDoc, {}, "u1")).resolves.toBeUndefined();
	});

	it("seeds a steading that already has a steadfast (steadfast branch skipped)", async () => {
		stubGame("u1");
		const seed = vi.fn(async () => {});
		const steadingDoc = {
			type: "steading",
			system: { steadfast: "stonetop" },
			typedActor: { seedReferenceMoves: seed },
		};
		await onCreateActor(steadingDoc, {}, "u1");
		expect(seed).toHaveBeenCalledOnce();
	});
});
