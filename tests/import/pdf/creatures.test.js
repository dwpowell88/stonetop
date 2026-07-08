import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { extractArticle } from "../../../scripts/import/pdf/layout.js";
import { parseStatBlock, toFollowerDoc, toNpcDoc } from "../../../scripts/import/pdf/creatures.js";
import { toSlug } from "../../../src/utils/slug.js";

const L = (text, font = "ACaslonPro-Regular", size = 9) => ({ text, font, size, spans: [{ font, size, text }], bbox: [0, 0, 0, 0] });

describe("parseStatBlock — follower Cost field", () => {
	const sb = parseStatBlock([
		L("The Servant", "Avara-Bold", 9), L("construct, large"),
		L("HP 24; Armor 4"), L("Cost wonder, excitement, joy (Loyalty ◯◯◯)"),
	]);
	it("captures the Cost field (loyalty ◯ markers stripped at parse; the '(Loyalty)' text goes later)", () => {
		expect(sb.cost).toBe("wonder, excitement, joy (Loyalty )");
		expect(sb.hp).toEqual({ value: 24, max: 24 });
		expect(sb.tagList).toEqual(["construct", "large"]);
	});
});

describe("parseStatBlock — arcana follower edge cases (real bugs from pp 263/264/267)", () => {
	it("does not let a trailing 'HP / Starts at N' sidebar clobber the real HP", () => {
		const c = parseStatBlock([
			L("Tulpa", "Avara-Bold", 9), L("spirit, tiny"),
			L("HP 8; Armor 0"), L("Cost respect given (Loyalty)"),
			L("HP"), L("Starts at 8"), L("39"), L("back"),
		]);
		expect(c.hp).toEqual({ value: 8, max: 8 });
	});
	it("does not let a page number / 'back' side-label bleed into the last field", () => {
		const c = parseStatBlock([
			L("Unliving chimera", "Avara-Bold", 9), L("Undead, construct"),
			L("HP 3; Armor 4 (0 vs. bronze)"), L("Cost lots of fresh blood (Loyalty)"),
			L("34"), L("back"),
		]);
		expect(c.cost).toBe("lots of fresh blood (Loyalty)");
		expect(c.armor).toBe("4 (0 vs. bronze)");
	});
	it("keeps the semicolons inside a 'Special qualities' value", () => {
		const c = parseStatBlock([
			L("Bronze protector", "Avara-Bold", 9), L("Construct, spirit"),
			L("Special qualities fireproof; holds +1 Readiness"), L("on a 7+ to Defend"),
		]);
		expect(c.specialQuality).toBe("fireproof; holds +1 Readiness on a 7+ to Defend");
	});
	it("does not absorb a multi-word, comma-less personality line as tags (but keeps a one-word wrap)", () => {
		const tulpa = parseStatBlock([
			L("Tulpa", "Avara-Bold", 9),
			L("Spirit, construct, tiny, naive, eager"),
			L("fierce kind sly timid willful"),
			L("HP 8; Armor 0"),
		]);
		expect(tulpa.tagList).toEqual(["Spirit", "construct", "tiny", "naive", "eager"]);
		const wrapped = parseStatBlock([
			L("X", "Avara-Bold", 9),
			L("Solitary, large, fae,"), L("corrupted"),
			L("HP 5"),
		]);
		expect(wrapped.tagList).toEqual(["Solitary", "large", "fae", "corrupted"]);
	});
	it("strips arcana checkbox/track markers and still splits □-prefixed move bullets", () => {
		// The real load pipeline injects □/○ vector markers into stat-block lines (loadStext fixtures
		// don't), polluting fields and hiding the leading ä on move bullets.
		const c = parseStatBlock([
			L("Tulpa", "Avara-Bold", 9), L("Spirit, construct □"),
			L("HP 8; Armor 0"), L("Instinct to play □ □ □"),
			L("□ ä Manifest a form"), L("□ ä Produce light"),
			L("Cost respect given □ □ □ comfort"),
		]);
		expect(c.tagList).toEqual(["Spirit", "construct"]);
		expect(c.instinct).toBe("to play");
		expect(c.moves.filter((m) => !m.prose).map((m) => m.text)).toEqual(["Manifest a form", "Produce light"]);
		expect(c.cost).toBe("respect given comfort");
	});
	it("does not mistake a wrapped damage tail starting with 'armor' for the Armor field", () => {
		const c = parseStatBlock([
			L("Dool spirit", "Avara-Bold", 9), L("Spirit"),
			L("HP 13; Armor 1 (amorphous)"),
			L("Damage feast on fear d6 (hand, close, ignores"),
			L("armor, disadvantage)"),
		]);
		expect(c.armor).toBe("1 (amorphous)");
		expect(c.damage).toBe("feast on fear d6 (hand, close, ignores armor, disadvantage)");
	});
	it("parses the damage value's italic weapon tags as markdown (from spans)", () => {
		const span = (text, font = "ACaslonPro-Regular") => ({ font, size: 9, text });
		const dmg = { text: "Damage feast on fear d6 (hand, close)", font: "ACaslonPro-Bold", size: 9, bbox: [0, 0, 0, 0],
			spans: [span("Damage", "ACaslonPro-Bold"), span(" feast on fear d6 ("), span("hand", "ACaslonPro-Italic"),
				span(", "), span("close", "ACaslonPro-Italic"), span(")")] };
		const c = parseStatBlock([L("X", "Avara-Bold", 9), L("spirit"), L("HP 8; Armor 0"), dmg]);
		expect(c.damage).toBe("feast on fear d6 (_hand_, _close_)");
	});
	it("collapses internal runs of whitespace in string fields (column-gap artifacts)", () => {
		const c = parseStatBlock([
			L("Tulpa", "Avara-Bold", 9), L("spirit"),
			L("HP 8; Armor 0"), L("Instinct   to play   to learn   to flaunt"),
		]);
		expect(c.instinct).toBe("to play to learn to flaunt");
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

	it("is a follower Item that preserves id/key/img/folder and links its arcanum", () => {
		expect(doc.type).toBe("follower");
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

describe("toNpcDoc", () => {
	const creature = {
		name: "Aurochs", tagList: ["large", "beast"], hp: { value: 12, max: 12 }, armor: "1",
		damage: "d8", specialQuality: "", instinct: "to roam", moves: [{ text: "trample", prose: false }],
		description: "A great shaggy ox.",
	};

	it("uses the marker icon passed by build-npcs", () => {
		const doc = toNpcDoc(creature, { img: "systems/stonetop/assets/content/wonders/markers/marker-beast.png" });
		expect(doc.type).toBe("npc");
		expect(doc.img).toBe("systems/stonetop/assets/content/wonders/markers/marker-beast.png");
	});

	it("defaults to the npc icon when no img is given (not Foundry's mystery-man)", () => {
		const doc = toNpcDoc(creature);
		expect(doc.img).toBe("systems/stonetop/assets/content/icons/npc.png");
	});
});

describe("toFollowerDoc — follower-specific shaping", () => {
	it("zeroes hp.value (current HP is tracked on the sheet) and keeps the book max", () => {
		// parseStatBlock yields hp.value === hp.max (the printed number); a follower stores value 0.
		const doc = toFollowerDoc({ name: "Dool spirit", hp: { value: 13, max: 13 }, moves: [] }, {});
		expect(doc.system.hp).toEqual({ value: 0, max: 13 });
	});
	it("keeps specialQuality as its own field (followers can have special qualities) — not folded into moves", () => {
		const doc = toFollowerDoc({
			name: "Void elemental", hp: { value: 0, max: 15 }, specialQuality: "immune to most harm",
			moves: [{ text: "Manifest as a black hole in reality", prose: false }],
		}, {});
		expect(doc.system.specialQuality).toBe("immune to most harm");
		expect(doc.system.moves).toBe("- Manifest as a black hole in reality");
	});
	it("makes damage dice rollable on the sheet (keeping italic weapon-tag markdown)", () => {
		const doc = toFollowerDoc({ name: "Bronze protector", hp: { value: 0, max: 13 },
			damage: "pummel 1d8 (_hand_)", moves: [] }, {});
		expect(doc.system.damage).toBe("pummel [[/r 1d8]] (_hand_)");
	});
	it("uses the provided canonical slug, not toSlug of a 'The …' name", () => {
		// "The Andalau of the Flute" → toSlug would give "the-andalau-of-the-flute", but the canonical
		// slug (filename + arcana back-ref) drops the leading "The".
		const doc = toFollowerDoc({ name: "The Andalau of the Flute", hp: { value: 0, max: 8 }, moves: [] },
			{ slug: "andalau-of-the-flute", arcanaSlug: "cracked-flute" });
		expect(doc.system.slug).toBe("andalau-of-the-flute");
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

describe("arcana followers — real fixtures (pp 263/264/267) parse + toFollowerDoc", () => {
	const followerBySlug = (name, title) => {
		const out = {};
		for (const sb of statBlocks(name, title)) {
			const c = parseStatBlock(sb.lines);
			if (c.name) out[toSlug(c.name)] = toFollowerDoc(c, { arcanaSlug: title }).system;
		}
		return out;
	};
	const minor = { ...followerBySlug("arcana-unliving-tulpa"), ...followerBySlug("arcana-bronze-protector") };

	it("parses the unliving chimera with its full (unsimplified) stats, italic tags + rollable dice", () => {
		const f = minor["unliving-chimera"];
		expect(f.hp).toEqual({ value: 0, max: 3 });
		expect(f.armor).toBe("4 (0 vs. bronze)");
		expect(f.damage).toBe("varies [[/r d6]] (_hand_, maybe others)");
		expect(f.tagList.selected).toEqual(["Undead", "construct", "terrifying", "clumsy"]);
		expect(f.instinct.selected).toEqual(["to get confused and lash out"]);
		expect(f.cost.selected).toEqual(["lots of fresh blood"]); // (Loyalty) + furniture stripped
		expect(f.loyalty).toEqual({ value: 0, max: 3 });
	});
	it("parses the tulpa, dropping the personality line and the HP sidebar", () => {
		const f = minor["tulpa"];
		expect(f.hp).toEqual({ value: 0, max: 8 });
		expect(f.tagList.selected).toEqual(["Spirit", "construct", "tiny", "naive", "eager"]);
		expect(f.cost.selected).toEqual(["respect given new experiences comfort/compassion"]);
	});
	it("parses the bronze protector, keeping Special qualities as its own field (with its ;)", () => {
		const f = minor["bronze-protector"];
		expect(f.hp).toEqual({ value: 0, max: 13 });
		expect(f.armor).toBe("3 (metal)");
		expect(f.specialQuality).toBe("fireproof; holds +1 Readiness on a 7+ to Defend; requires a smithy and tools to regain HP");
		expect(f.moves.split("\n")[0]).toBe("- Loom menacingly, belching smoke");
		expect(f.cost.selected).toEqual(["profuse gratitude"]);
	});
});

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
		expect(c.damage).toBe("jaws like a cave d12+7 (_reach_, _forceful_, _messy_, 3 piercing), thrashing coils d12+5 (_close_, _area_, _forceful_)");
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
