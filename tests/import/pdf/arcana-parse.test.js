import { describe, it, expect } from "vitest";
import { parseTrack, stripMarkers, splitLoyalty, parseItemLine, unlockSlug } from "../../../scripts/import/pdf/arcana-parse.js";

describe("parseTrack", () => {
	it("counts a single leading box as a max-1 track and strips it", () => {
		expect(parseTrack("□ … you must restore the runes")).toEqual({ max: 1, text: "… you must restore the runes" });
	});
	it("counts leading + trailing boxes around an entry (embedded track)", () => {
		expect(parseTrack("◻◻◻ You lose yourself in a blood-rage. ◻")).toEqual({ max: 4, text: "You lose yourself in a blood-rage." });
	});
	it("treats a pure circle run (text-layer 'l' glyphs) as a track with empty text", () => {
		expect(parseTrack("l l l l l")).toEqual({ max: 5, text: "" });
	});
	it("treats a pure ○ run as a track with empty text", () => {
		expect(parseTrack("○ ○ ○")).toEqual({ max: 3, text: "" });
	});
	it("never miscounts 'l's inside real words", () => {
		expect(parseTrack("I will call the spirits")).toEqual({ max: 0, text: "I will call the spirits" });
	});
});

describe("stripMarkers", () => {
	it("removes box/circle/diamond glyphs from markdown text, keeping emphasis", () => {
		expect(stripMarkers("◻◻ **You** lose yourself ◻")).toBe("**You** lose yourself");
	});
});

describe("splitLoyalty", () => {
	it("pulls (Loyalty ◯◯◯) off a cost line into a max", () => {
		expect(splitLoyalty("wonder, excitement, joy, discovery (Loyalty ◯◯◯)"))
			.toEqual({ cost: "wonder, excitement, joy, discovery", loyaltyMax: 3 });
	});
	it("handles ○ glyphs and extra spaces, no loyalty → null max", () => {
		expect(splitLoyalty("to be useful (Loyalty ○ ○)")).toEqual({ cost: "to be useful", loyaltyMax: 2 });
		expect(splitLoyalty("wonder and joy")).toEqual({ cost: "wonder and joy", loyaltyMax: null });
	});
});

describe("parseItemLine", () => {
	it("builds an item from a leading-comma tags line (name = arcanum name, weight from ◇ pips)", () => {
		expect(parseItemLine(", close, +1 damage, messy, magical", { name: "Blood-quenched Sword", pips: 1 }))
			.toEqual({ name: "Blood-quenched Sword", weight: 1, note: "close, +1 damage, messy, magical", inventoryColumn: "regular" });
	});
	it("uses ◇ pip count for weight and strips leading ◇", () => {
		expect(parseItemLine("◇◇ , awkward", { name: "Mindgem", pips: 2 }).weight).toBe(2);
	});
	it("returns null when there is no tags text and no pips", () => {
		expect(parseItemLine("", { name: "X", pips: 0 })).toBeNull();
	});
});

describe("unlockSlug", () => {
	it("is a deterministic kebab of the option's salient words", () => {
		const s = unlockSlug("… imbibe a prodigious, dangerous quantity of alcohol.");
		expect(s).toMatch(/^[a-z0-9-]+$/);
		expect(unlockSlug("… imbibe a prodigious, dangerous quantity of alcohol.")).toBe(s); // stable
	});
});
