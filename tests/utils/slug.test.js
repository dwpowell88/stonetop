import { describe, it, expect } from "vitest";
import { toSlug } from "../../src/utils/slug.js";

describe("toSlug", () => {
	it("kebab-cases a name", () => {
		expect(toSlug("Eye of the Storm")).toBe("eye-of-the-storm");
	});
	it("drops straight and curly apostrophes rather than hyphenating them", () => {
		expect(toSlug("Storm's Fury")).toBe("storms-fury");   // straight U+0027
		expect(toSlug("Storm’s Fury")).toBe("storms-fury"); // curly U+2019 (the book's glyph)
		expect(toSlug("Noruba’s Ice Sphere")).toBe("norubas-ice-sphere");
	});
	it("trims leading/trailing separators", () => {
		expect(toSlug("  Hec’tumel Codex  ")).toBe("hectumel-codex");
	});
});
