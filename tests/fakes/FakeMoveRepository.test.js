import { describe, it, expect } from "vitest";
import { FakeMoveRepository } from "./FakeMoveRepository.js";
import { FakeCompendiumMoveBuilder } from "./FakeCompendiumMoveBuilder.js";

describe("FakeMoveRepository — world moves via addWorld", () => {
	it("buildSlugIndex includes world moves", async () => {
		const repo = new FakeMoveRepository();
		repo.addWorld(new FakeCompendiumMoveBuilder().withName("Iron Wall").build());
		const index = await repo.buildSlugIndex();
		expect(index.has("iron-wall")).toBe(true);
		expect(index.get("iron-wall").name).toBe("Iron Wall");
	});

	it("getBasicMoves returns world moves with moveType basic", async () => {
		const repo = new FakeMoveRepository();
		repo.addWorld(
			new FakeCompendiumMoveBuilder().withName("Defy Danger").withMoveType("basic").build()
		);
		const moves = await repo.getBasicMoves();
		expect(moves.some(m => m.name === "Defy Danger")).toBe(true);
	});

	it("getReferencedMoveDocument falls back to world store", async () => {
		const repo = new FakeMoveRepository();
		repo.addWorld(
			new FakeCompendiumMoveBuilder().withName("Aid or Interfere").withMoveType("basic").build()
		);
		const doc = await repo.getReferencedMoveDocument("aid-or-interfere");
		expect(doc).not.toBeNull();
		expect(doc.name).toBe("Aid or Interfere");
	});
});
