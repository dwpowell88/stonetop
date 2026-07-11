import { describe, it, expect } from "vitest";
import { autoRollDice, toRollableMarkup, enrichGameText, clearEnrichCache } from "../../src/utils/enrichGameText.js";

describe("enrichGameText caching", () => {
	it("serves a second identical call from cache (skips enrichHTML)", async () => {
		clearEnrichCache();
		let calls = 0;
		const orig = foundry.applications.ux.TextEditor.implementation.enrichHTML;
		foundry.applications.ux.TextEditor.implementation.enrichHTML = async html => { calls++; return html; };
		try {
			await enrichGameText("deal d8 damage");
			await enrichGameText("deal d8 damage");
			expect(calls).toBe(1); // second call cached
		} finally {
			foundry.applications.ux.TextEditor.implementation.enrichHTML = orig;
		}
	});

	it("does NOT cache rollData-dependent text (contains @)", async () => {
		clearEnrichCache();
		let calls = 0;
		const orig = foundry.applications.ux.TextEditor.implementation.enrichHTML;
		foundry.applications.ux.TextEditor.implementation.enrichHTML = async html => { calls++; return html; };
		try {
			await enrichGameText("deal @str damage");
			await enrichGameText("deal @str damage");
			expect(calls).toBe(2); // re-enriched each time
		} finally {
			foundry.applications.ux.TextEditor.implementation.enrichHTML = orig;
		}
	});
});

describe("autoRollDice", () => {
	it("wraps a bare die in an inline-roll", () => {
		expect(autoRollDice("claws d6 (hand)")).toBe("claws [[/r d6]] (hand)");
	});

	it("wraps multiple dice across or-separated attacks", () => {
		expect(autoRollDice("d8, maw d10+2")).toBe("[[/r d8]], maw [[/r d10+2]]");
	});

	it("does not double-wrap an existing inline roll", () => {
		expect(autoRollDice("roll [[/r 2d6]] now")).toBe("roll [[/r 2d6]] now");
	});

	it("leaves dice inside a @UUID link label alone", () => {
		expect(autoRollDice("@UUID[Actor.abc]{a d6 thing} d8"))
			.toBe("@UUID[Actor.abc]{a d6 thing} [[/r d8]]");
	});

	it("leaves prose without dice unchanged", () => {
		expect(autoRollDice("no dice here, 1 piercing")).toBe("no dice here, 1 piercing");
	});
});

describe("toRollableMarkup (markdown + dice, Foundry tokens protected)", () => {
	it("renders bold/italic and wraps bare dice", () => {
		expect(toRollableMarkup("**bronze knife** d6 (hand)"))
			.toBe("<strong>bronze knife</strong> [[/r d6]] (hand)");
		expect(toRollableMarkup("*spindly* d8")).toBe("<em>spindly</em> [[/r d8]]");
	});

	it("preserves @UUID links through the markdown pass", () => {
		expect(toRollableMarkup("see @UUID[Actor.abc]{Garm} for d6"))
			.toBe("see @UUID[Actor.abc]{Garm} for [[/r d6]]");
	});

	it("preserves an explicit inline roll through the markdown pass", () => {
		expect(toRollableMarkup("roll [[/r 2d6]] now")).toBe("roll [[/r 2d6]] now");
	});

	it("does not corrupt plain numbers in prose (sentinel cannot collide)", () => {
		expect(toRollableMarkup("deal 5 damage to 2 foes")).toBe("deal 5 damage to 2 foes");
	});

	it("returns empty string for empty input", () => {
		expect(toRollableMarkup("")).toBe("");
		expect(toRollableMarkup(null)).toBe("");
	});
});

describe("toRollableMarkup — autoRoll option", () => {
	it("leaves bare dice as plain text when autoRoll is false", () => {
		expect(toRollableMarkup("from **d6** to d8", { autoRoll: false }))
			.toBe("from <strong>d6</strong> to d8");
	});

	it("still protects and keeps explicit rolls/links when autoRoll is false", () => {
		expect(toRollableMarkup("roll [[/r 2d6]] and see @UUID[Actor.x]{Garm}", { autoRoll: false }))
			.toBe("roll [[/r 2d6]] and see @UUID[Actor.x]{Garm}");
	});
});

describe("enrichGameText", () => {
	it("runs the markup through Foundry enrichHTML (stubbed pass-through)", async () => {
		const out = await enrichGameText("**bronze** d6");
		expect(out).toContain("<strong>bronze</strong>");
		expect(out).toContain("[[/r d6]]");
	});

	it("returns empty string for empty input", async () => {
		expect(await enrichGameText("")).toBe("");
	});
});

