import { describe, it, expect } from "vitest";
import { RichText, rich, hasText } from "../../../src/model/snapshot/RichText.js";

describe("rich() — the single entry point", () => {
	it("wraps a string as a RichText (raw set, autoRoll off, html unset)", () => {
		const r = rich("**bold** text");
		expect(r).toBeInstanceOf(RichText);
		expect(r.raw).toBe("**bold** text");
		expect(r.autoRoll).toBe(false);
		expect(r.html).toBeNull();
	});

	it("sets autoRoll when { roll: true }", () => {
		expect(rich("d6", { roll: true }).autoRoll).toBe(true);
	});

	it("is idempotent: passing a RichText returns the same instance", () => {
		const r = rich("x");
		expect(rich(r)).toBe(r);
	});

	it("coerces null/undefined to an empty RichText that renders to ''", () => {
		expect(rich(null).raw).toBe("");
		expect(rich(undefined).render()).toBe("");
	});

	it("coerces a non-string (number) to its string form", () => {
		expect(rich(7).raw).toBe("7");
	});
});

describe("hasText() — string-or-RichText truthiness for shared partials", () => {
	it("is true for a non-empty string and a non-empty RichText", () => {
		expect(hasText("note")).toBe(true);
		expect(hasText(rich("note"))).toBe(true);
	});

	it("is false for empty/whitespace strings, empty RichText, and null/undefined", () => {
		expect(hasText("")).toBe(false);
		expect(hasText("   ")).toBe(false);
		expect(hasText(rich(""))).toBe(false);
		expect(hasText(rich(null))).toBe(false);
		expect(hasText(null)).toBe(false);
		expect(hasText(undefined)).toBe(false);
	});
});

describe("RichText.render()", () => {
	it("renders markdown synchronously when html is unset (no flicker fallback)", () => {
		expect(rich("**bold**").render()).toBe("<strong>bold</strong>");
	});

	it("returns the enriched html verbatim once set", () => {
		const r = rich("**bold**");
		r.html = "<a>clickable</a>";
		expect(r.render()).toBe("<a>clickable</a>");
	});

	it("empty raw renders to ''", () => {
		expect(rich("").render()).toBe("");
	});
});

describe("RichText.enrich()", () => {
	it("fills html via the shared pipeline; prose keeps bare dice as text", async () => {
		const r = rich("deal d6");
		await r.enrich();
		// foundry.enrichHTML is a pass-through stub, so html === toRollableMarkup output.
		expect(r.html).toContain("d6");
		expect(r.html).not.toContain("[[/r");
		expect(r.render()).toBe(r.html);
	});

	it("auto-rolls bare dice when autoRoll is set", async () => {
		const r = rich("deal d6", { roll: true });
		await r.enrich();
		expect(r.html).toContain("[[/r d6]]");
	});
});
