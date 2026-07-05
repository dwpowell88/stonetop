import { describe, it, expect } from "vitest";
import { ArcanumData } from "../../src/data/ArcanumData.js";

describe("ArcanumData defaults", () => {
	it("defaults weight to 1 and major to false", () => {
		const d = new ArcanumData();
		expect(d.weight).toBe(1);
		expect(d.major).toBe(false);
	});

	it("defaults description to empty string", () => {
		expect(new ArcanumData().description).toBe("");
	});

	it("defaults slug and sortOrder to null", () => {
		const d = new ArcanumData();
		expect(d.slug).toBeNull();
		expect(d.sortOrder).toBeNull();
	});

	it("defaults front and back to null", () => {
		const d = new ArcanumData();
		expect(d.front).toBeNull();
		expect(d.back).toBeNull();
	});

	it("defaults choiceValues to empty object", () => {
		expect(new ArcanumData().choiceValues).toEqual({});
	});
});

describe("ArcanumData.migrateData — legacy value stores → choiceValues", () => {
	it("folds unlockValues and backChoiceValues into one choiceValues store (deep-merged by group slug)", () => {
		const out = ArcanumData.migrateData({
			slug: "cracked-flute",
			unlockValues:     { "cracked-flute": { "marks": 2 } },
			backChoiceValues: { "cracked-flute": { "andalau": 1 } },
		});
		expect(out.choiceValues).toEqual({ "cracked-flute": { "marks": 2, "andalau": 1 } });
		expect(out.unlockValues).toBeUndefined();
		expect(out.backChoiceValues).toBeUndefined();
	});

	it("preserves distinct group keys (e.g. consequences authored separately)", () => {
		const out = ArcanumData.migrateData({
			unlockValues:  { "azure": { "marks": 3 } },
			choiceValues:  { "consequences": { "c1": 1 } },
		});
		expect(out.choiceValues).toEqual({ "azure": { "marks": 3 }, "consequences": { "c1": 1 } });
	});

	it("is a no-op when there are no legacy stores (does not clobber a plain choiceValues diff)", () => {
		const out = ArcanumData.migrateData({ choiceValues: { "azure": { "marks": 1 } } });
		expect(out.choiceValues).toEqual({ "azure": { "marks": 1 } });
	});

	it("is a no-op on an unrelated partial diff", () => {
		const out = ArcanumData.migrateData({ flipped: true });
		expect(out).toEqual({ flipped: true });
	});
});
