import { describe, it, expect } from "vitest";
import * as CE from "../../src/utils/followerCompanionEdit.js";

describe("followerCompanionEdit", () => {
	it("newType is a blank stat template with a generated slug", () => {
		const t = CE.newType();
		expect(t.slug).toMatch(/^type-/);
		expect(t).toMatchObject({ name: "", variants: [], hp: { value: 0, max: 0 }, armor: "", damage: "", pickCount: 0, options: [], defaults: [] });
	});

	it("setEnabled toggles the flag on a whole-object clone", () => {
		const companion = { enabled: false, catalog: [] };
		const next = CE.setEnabled(companion, true);
		expect(next.enabled).toBe(true);
		expect(companion.enabled).toBe(false);
	});

	it("addType appends a catalog entry", () => {
		const companion = { enabled: true, catalog: [] };
		const next = CE.addType(companion);
		expect(next.catalog).toHaveLength(1);
		expect(companion.catalog).toHaveLength(0);
	});

	it("removeType drops the catalog entry at index", () => {
		const companion = { catalog: [{ slug: "bird" }, { slug: "brute" }] };
		expect(CE.removeType(companion, 0).catalog.map(t => t.slug)).toEqual(["brute"]);
		expect(companion.catalog).toHaveLength(2);
	});

	it("setTypeField sets a dotted field on catalog[index]", () => {
		const companion = { catalog: [{ slug: "bird", hp: { value: 5, max: 5 }, options: [] }] };
		expect(CE.setTypeField(companion, { index: 0, field: "hp.max", value: 8 }).catalog[0].hp.max).toBe(8);
		expect(CE.setTypeField(companion, { index: 0, field: "options", value: ["fast"] }).catalog[0].options).toEqual(["fast"]);
		expect(companion.catalog[0].hp.max).toBe(5);
	});
});
