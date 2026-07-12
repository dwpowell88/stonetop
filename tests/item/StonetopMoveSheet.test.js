import { describe, it, expect } from "vitest";
import { moveSheetRichText } from "../../src/item/StonetopMoveSheet.js";
import { RichText } from "../../src/model/snapshot/RichText.js";

describe("moveSheetRichText", () => {
	it("wraps description and the three move results as RichText", () => {
		const r = moveSheetRichText({
			description: "**hit** them",
			moveResults: {
				success: { value: "10+ text" },
				partial: { value: "7-9 text" },
				failure: { value: "miss text" },
			},
		});
		for (const k of ["description", "success", "partial", "failure"]) {
			expect(r[k]).toBeInstanceOf(RichText);
		}
		expect(r.description.raw).toBe("**hit** them");
		expect(r.success.raw).toBe("10+ text");
		expect(r.partial.raw).toBe("7-9 text");
		expect(r.failure.raw).toBe("miss text");
	});

	it("defaults missing fields to empty RichText (renders to '')", () => {
		const r = moveSheetRichText({});
		expect(r.description.render()).toBe("");
		expect(r.success.render()).toBe("");
		expect(r.partial.render()).toBe("");
		expect(r.failure.render()).toBe("");
	});
});
