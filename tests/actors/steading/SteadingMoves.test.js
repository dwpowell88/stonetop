import { describe, it, expect } from "vitest";
import { SteadingMoves } from "../../../src/actors/steading/SteadingMoves.js";
import { RichText } from "../../../src/model/snapshot/RichText.js";

function repoWith(entries) {
	return { async getHomefrontMoves() { return entries; } };
}

describe("SteadingMoves.buildSnapshot", () => {
	it("returns null when there are no homefront moves", async () => {
		const moves = new SteadingMoves({}, repoWith([]));
		expect(await moves.buildSnapshot()).toBeNull();
	});

	it("wraps each move description as RichText for the shared enrich pass (no pre-enrichment)", async () => {
		const moves = new SteadingMoves({}, repoWith([
			{ id: "m1", name: "Trade", description: "Gain **surplus** [[/r 2d6]]", rollStat: "prosperity" },
		]));
		const snap = await moves.buildSnapshot();
		expect(snap.key).toBe("homefront");
		expect(snap.moves).toHaveLength(1);
		const move = snap.moves[0];
		expect(move.description).toBeInstanceOf(RichText);
		expect(move.description.raw).toBe("Gain **surplus** [[/r 2d6]]");
		expect(move.description.html).toBeNull();   // not enriched here — the sheet's tree pass does it
		expect(move.slug).toBe("m1");
		expect(move.rollStat).toBe("prosperity");
		expect(move.locked).toBe(true);
	});

	it("falls back to slug from id and empty description", async () => {
		const moves = new SteadingMoves({}, repoWith([{ id: "m2", name: "Watch" }]));
		const move = (await moves.buildSnapshot()).moves[0];
		expect(move.slug).toBe("m2");
		expect(move.description.raw).toBe("");
	});
});
