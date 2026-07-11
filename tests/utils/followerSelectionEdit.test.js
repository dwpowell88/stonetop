import { describe, it, expect } from "vitest";
import * as SE from "../../src/utils/followerSelectionEdit.js";

describe("followerSelectionEdit", () => {
	it("normalizes a stored value into a raw with the field's fixed multi", () => {
		const r = SE.toSelectionRaw({ selected: ["group"], options: ["group", "brave"], allowCustom: false }, true);
		expect(r).toEqual({ selected: ["group"], options: ["group", "brave"], multi: true, allowCustom: false });
	});

	it("tolerates a null/garbage stored value", () => {
		expect(SE.toSelectionRaw(null, false)).toEqual({ selected: [], options: [], multi: false, allowCustom: true });
		expect(SE.toSelectionRaw("legacy string", false)).toEqual({ selected: [], options: [], multi: false, allowCustom: true });
	});

	it("addOption appends a blank option row", () => {
		expect(SE.addOption({ options: ["a"] }, false).options).toEqual(["a", ""]);
	});

	it("removeOption drops the option and any matching default", () => {
		const r = SE.removeOption({ selected: ["a"], options: ["a", "b"] }, 0, true);
		expect(r.options).toEqual(["b"]);
		expect(r.selected).toEqual([]);
	});

	it("setOption renames the option and keeps a matching default in sync", () => {
		const r = SE.setOption({ selected: ["a"], options: ["a", "b"] }, 0, "aardvark", true);
		expect(r.options).toEqual(["aardvark", "b"]);
		expect(r.selected).toEqual(["aardvark"]);
	});

	it("setSelected keeps at most one for single-select, all for multi", () => {
		expect(SE.setSelected({ options: [] }, ["x", "y"], false).selected).toEqual(["x"]);
		expect(SE.setSelected({ options: [] }, ["x", "y"], true).selected).toEqual(["x", "y"]);
		expect(SE.setSelected({ options: [] }, ["  x ", "", "y"], true).selected).toEqual(["x", "y"]);
	});

	it("parseCsv trims and drops empties", () => {
		expect(SE.parseCsv("a, b ,,c")).toEqual(["a", "b", "c"]);
		expect(SE.parseCsv(null)).toEqual([]);
	});
});
