import { describe, it, expect } from "vitest";
import { SheetSize } from "../../src/utils/SheetSize.js";

describe("SheetSize", () => {
	it("round-trips a valid size through fromObject/toObject", () => {
		const size = SheetSize.fromObject({ width: 1000, height: 700 });
		expect(size).toBeInstanceOf(SheetSize);
		expect(size.toObject()).toEqual({ width: 1000, height: 700 });
	});

	it("returns null for a missing object", () => {
		expect(SheetSize.fromObject(null)).toBeNull();
		expect(SheetSize.fromObject(undefined)).toBeNull();
	});

	it("returns null when a dimension is missing", () => {
		expect(SheetSize.fromObject({ width: 1000 })).toBeNull();
		expect(SheetSize.fromObject({ height: 700 })).toBeNull();
	});

	it("returns null for non-positive or non-finite dimensions", () => {
		expect(SheetSize.fromObject({ width: 0, height: 700 })).toBeNull();
		expect(SheetSize.fromObject({ width: -5, height: 700 })).toBeNull();
		expect(SheetSize.fromObject({ width: 1000, height: Infinity })).toBeNull();
		expect(SheetSize.fromObject({ width: NaN, height: 700 })).toBeNull();
	});

	it("returns null when a dimension is not a number (e.g. Foundry's 'auto')", () => {
		expect(SheetSize.fromObject({ width: "auto", height: 700 })).toBeNull();
		expect(SheetSize.fromObject({ width: 1000, height: "auto" })).toBeNull();
	});
});
