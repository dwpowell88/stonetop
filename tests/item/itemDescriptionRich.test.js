import { describe, it, expect } from "vitest";
import { itemDescriptionRich } from "../../src/item/itemDescriptionRich.js";
import { RichText } from "../../src/model/snapshot/RichText.js";

describe("itemDescriptionRich", () => {
	it("wraps system.description as a RichText carrying the raw markdown", () => {
		const r = itemDescriptionRich({ description: "A **fine** blade." });
		expect(r.description).toBeInstanceOf(RichText);
		expect(r.description.raw).toBe("A **fine** blade.");
		expect(r.description.html).toBeNull();   // enriched later by the sheet's tree pass
	});

	it("coerces a missing description to an empty RichText", () => {
		expect(itemDescriptionRich({}).description.raw).toBe("");
		expect(itemDescriptionRich(undefined).description.raw).toBe("");
	});
});
