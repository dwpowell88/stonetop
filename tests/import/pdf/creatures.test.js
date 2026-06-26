import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { extractArticle } from "../../../scripts/import/pdf/layout.js";
import { parseStatBlock, toFollowerDoc } from "../../../scripts/import/pdf/creatures.js";

const L = (text, font = "ACaslonPro-Regular", size = 9) => ({ text, font, size, spans: [{ font, size, text }], bbox: [0, 0, 0, 0] });

describe("parseStatBlock — follower Cost field", () => {
	const sb = parseStatBlock([
		L("The Servant", "Avara-Bold", 9), L("construct, large"),
		L("HP 24; Armor 4"), L("Cost wonder, excitement, joy (Loyalty ◯◯◯)"),
	]);
	it("captures the Cost field (with the loyalty marker still attached — stripped later)", () => {
		expect(sb.cost).toBe("wonder, excitement, joy (Loyalty ◯◯◯)");
		expect(sb.hp).toEqual({ value: 24, max: 24 });
		expect(sb.tagList).toEqual(["construct", "large"]);
	});
});

describe("toFollowerDoc", () => {
	const creature = {
		name: "The Mighty Servant", tagList: ["large", "construct"], hp: { value: 0, max: 24 },
		armor: "4", damage: "stone fists d10+1", specialQuality: "", instinct: "to misunderstand",
		cost: "wonder, excitement, joy, discovery (Loyalty ◯◯◯)",
		moves: [{ text: "living stone, tireless", prose: false }], description: "",
	};
	const doc = toFollowerDoc(creature, { arcanaSlug: "mindgem", id: "abc", key: "!items!abc",
		img: "systems/stonetop/assets/content/icons/the-mighty-servant.png", folder: "F" });

	it("is an npc Item that preserves id/key/img/folder and links its arcanum", () => {
		expect(doc.type).toBe("npc");
		expect([doc._id, doc._key, doc.img, doc.folder]).toEqual(["abc", "!items!abc", "systems/stonetop/assets/content/icons/the-mighty-servant.png", "F"]);
		expect(doc.system.arcanaSlug).toBe("mindgem");
		expect(doc.system.slug).toBe("the-mighty-servant");
	});
	it("strips (Loyalty ◯◯◯) from cost and defaults loyalty.max to 3", () => {
		expect(doc.system.cost.selected).toEqual(["wonder, excitement, joy, discovery"]);
		expect(doc.system.loyalty).toEqual({ value: 0, max: 3 });
	});
	it("builds Selection shapes + a bullet moves string + empty choices", () => {
		expect(doc.system.tagList).toEqual({ selected: ["large", "construct"], options: [], multi: true, allowCustom: true });
		expect(doc.system.instinct.selected).toEqual(["to misunderstand"]);
		expect(doc.system.moves).toBe("- living stone, tireless");
		expect(doc.system.choices).toEqual([{ slug: "choices", list: [] }]);
	});
});

const load = (name) =>
	JSON.parse(readFileSync(fileURLToPath(new URL(`./fixtures/${name}.lines.json`, import.meta.url)), "utf8"));

const statBlocks = (name, title) => {
	const art = extractArticle(load(name), { title });
	const out = [];
	for (const s of art.sections) for (const c of [...s.left, ...s.right]) for (const b of c.blocks) if (b.type === "statblock") out.push(b);
	return out;
};

describe("parseStatBlock — The Crombil, Awakened", () => {
	const blocks = statBlocks("crombil", "The Crombil");
	const c = parseStatBlock(blocks[0].lines);

	it("reads the name and the italic tag line", () => {
		expect(c.name).toBe("The Crombil, Awakened");
		expect(c.tagList).toEqual(["Solitary", "huge", "terrifying", "fearless", "fireproof"]);
	});

	it("splits combined 'HP …; Armor …' line into the right fields", () => {
		expect(c.hp).toEqual({ value: 26, max: 26 });
		expect(c.armor).toBe("3 (scales, boney ridges)");
	});

	it("joins a wrapped Damage value across lines", () => {
		expect(c.damage).toBe("jaws like a cave d12+7 (reach, forceful, messy, 3 piercing), thrashing coils d12+5 (close, area, forceful)");
	});

	it("joins wrapped Special qualities and reads Instinct", () => {
		expect(c.specialQuality).toBe("fiery heat, stomach like a furnace, too big to hurt with most weapons");
		expect(c.instinct).toBe("to devour");
	});

	it("collects the move bullets, joining their wraps (not splitting on a same-x wrap)", () => {
		const bullets = c.moves.filter((m) => !m.prose).map((m) => m.text);
		expect(bullets).toContain("Chomp right through anything");
		expect(bullets).toContain("Batter them with debris, cinders (d6 damage)");
		expect(bullets).toContain("Make them fight for any sort of purchase or bearings");
		expect(bullets).toContain("Blister skin, burn lungs, singe hair (d8 damage)");
	});

	it("keeps the inter-group transition sentence inline in moves as prose (not a bullet)", () => {
		const prose = c.moves.find((m) => m.prose);
		expect(prose?.text).toContain("When someone’s been swallowed by the Crombil");
		// it sits between the two move groups, in order
		const i = c.moves.indexOf(prose);
		expect(c.moves[i - 1].prose).toBe(false);
		expect(c.moves[i + 1].prose).toBe(false);
		expect(c.description).not.toContain("start using these moves");
	});
});
