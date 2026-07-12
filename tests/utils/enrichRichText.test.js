import { describe, it, expect } from "vitest";
import { enrichRichTextTree } from "../../src/utils/enrichRichText.js";
import { rich, RichText } from "../../src/model/snapshot/RichText.js";

// foundry.applications.ux.TextEditor.implementation.enrichHTML is a pass-through stub (tests/setup.js),
// so after enrichment a RichText's html === toRollableMarkup(raw). We assert html is populated and
// reflects the right autoRoll mode, plus the traversal/dedup behaviour.

function withCountedEnrich(fn) {
	return async () => {
		let calls = 0;
		const orig = foundry.applications.ux.TextEditor.implementation.enrichHTML;
		foundry.applications.ux.TextEditor.implementation.enrichHTML = async html => { calls++; return html; };
		try { return await fn(() => calls); }
		finally { foundry.applications.ux.TextEditor.implementation.enrichHTML = orig; }
	};
}

describe("enrichRichTextTree", () => {
	it("fills html on a top-level RichText field", async () => {
		const tree = { title: rich("**Hi**") };
		await enrichRichTextTree(tree);
		expect(tree.title.html).toBe("<strong>Hi</strong>");
	});

	it("recurses into nested objects and arrays", async () => {
		const tree = { back: { moves: [{ description: rich("*a*") }, { description: rich("*b*") }] } };
		await enrichRichTextTree(tree);
		expect(tree.back.moves[0].description.html).toBe("<em>a</em>");
		expect(tree.back.moves[1].description.html).toBe("<em>b</em>");
	});

	it("passes autoRoll through (rollable → inline roll, prose → plain)", async () => {
		const tree = { dmg: rich("d6", { roll: true }), text: rich("d6") };
		await enrichRichTextTree(tree);
		expect(tree.dmg.html).toContain("[[/r d6]]");
		expect(tree.text.html).not.toContain("[[/r");
	});

	it("ignores non-RichText values without throwing", async () => {
		const tree = { n: 7, s: "plain string", nil: null, arr: [1, "two"], nested: { x: true } };
		await expect(enrichRichTextTree(tree)).resolves.toBe(tree);
	});

	it("is a no-op on an empty tree / tree with no RichText", withCountedEnrich(async calls => {
		await enrichRichTextTree({ a: 1, b: { c: [] } });
		expect(calls()).toBe(0);
	}));

	it("enriches each distinct RichText once, deduping a shared instance", withCountedEnrich(async calls => {
		const shared = rich("once");
		await enrichRichTextTree({ a: shared, b: shared, c: rich("two") });
		expect(calls()).toBe(2);
	}));

	it("is cycle-safe", async () => {
		const tree = { t: rich("ok") };
		tree.self = tree;
		await expect(enrichRichTextTree(tree)).resolves.toBe(tree);
		expect(tree.t.html).toBe("ok");
	});

	it("returns the same tree object it was given", async () => {
		const tree = { t: rich("x") };
		expect(await enrichRichTextTree(tree)).toBe(tree);
	});
});
