import { describe, expect, it } from "vitest";
import { StonetopCharacter } from "../../../src/actors/character/StonetopCharacter.js";
import { FakeCharacterActorBuilder } from "../../fakes/FakeCharacterActorBuilder.js";
import { FakeRepositoryFactory } from "../../fakes/FakeRepositoryFactory.js";

function makeCharacter(actor) {
	return new StonetopCharacter(actor, new FakeRepositoryFactory());
}

// -- rollMode ------------------------------------------------------------------

describe("StonetopCharacter.rollMode", () => {
	it("returns stored flag value", () => {
		const actor = new FakeCharacterActorBuilder().withRollMode("adv").build();
		expect(makeCharacter(actor).rollMode).toBe("adv");
	});

	it("defaults to 'normal' when flag not set", () => {
		const actor = new FakeCharacterActorBuilder().build();
		expect(makeCharacter(actor).rollMode).toBe("normal");
	});

	it("setRollMode writes flag and updates rollMode", async () => {
		const actor = new FakeCharacterActorBuilder().build();
		const character = makeCharacter(actor);
		await character.setRollMode("adv");
		expect(character.rollMode).toBe("adv");
	});
});
