import { describe, it, expect } from "vitest";
import { extractNpcBlocks, parseNpcBlock, toSpiritDoc, toGuideDoc } from "../../scripts/import/build-spirits.js";

// The four real block shapes: a social spirit (run-in Instinct/Manifests/Expects/Notes), a named
// spirit with move bullets + lore + an embedded statblock aside, a primordial (Damage but no HP),
// and a follower whose tag line spills into the body ("…; **Instinct** to" / "… **Cost** …").
const ARTICLE = `
<div class="page2col"><div class="col"><hr class="rule">
<h3><img class="icon" src="systems/stonetop/assets/content/wonders/markers/marker-swirl.png">Hearth spirit</h3>
<p class="artifact-tags"><em>Solitary</em>, <em>spirit</em>, <em>friendly</em>, <em>nurturing</em></p>
<p><strong>Instinct</strong> to belong. <strong>Manifests</strong> as pops &amp; whispers. <strong>Expects</strong> warm greetings. <strong>Notes</strong> Natters on quietly.</p>
<h3><img class="icon" src="systems/stonetop/assets/content/wonders/markers/marker-swirl.png">The Halfeyd</h3>
<p class="artifact-tags"><em>Spirit</em>, <em>magical</em>, <em>fickle</em></p>
<p><strong>Instinct</strong> to terrorize its prey</p>
<ul><li>Mark someone as prey</li><li>Set hunting beasts on their trail</li></ul>
<p>When you make a kill, you leave an offering.</p>
<p><strong>Something interesting:</strong> You’ll be hounded for 3 days.</p>
<aside class="statblock"><strong>Nerth serpent</strong><em>Solitary</em><strong>HP</strong> 20</aside>
<h3><img class="icon" src="systems/stonetop/assets/content/wonders/markers/marker-danger.png">Primordial flame</h3>
<p class="artifact-tags"><em>Primordial</em>, <em>terrifying</em>, <em>magical</em></p>
<p><strong>Damage</strong> 1d12 w/advantage (<em>hand</em>, <em>messy</em>, ignores armor)</p>
<ul><li>Start normal fires nearby</li></ul>
<h3><img class="icon" src="systems/stonetop/assets/content/wonders/markers/marker-person.png">Alastar</h3>
<p class="artifact-tags"><em>exceptional</em>, <em>old</em>, <em>devious</em>; <strong>Instinct</strong> to</p>
<p>feel no remorse; <strong>Cost</strong> payment in hand.</p>
<h3><img class="icon" src="systems/stonetop/assets/content/wonders/markers/marker-vessel.png">A lead bracelet</h3>
<p class="artifact-tags"><em>magical</em>, Value 1</p>
<p>An artifact — not NPC-shaped, must be skipped.</p>
<h2>Dangers</h2>
<p>Section prose.</p></div></div>
`;

const FEN_WALKER_BASE = {
	_id: "fenwalkerid000000",
	name: "Fen-walker",
	system: {
		tagList: { selected: ["Fen-wise", "cautious", "(and see below)"], options: [], multi: true, allowCustom: true },
		hp: { value: 8, max: 8 },
		armor: "1 (leather cuirass)",
		damage: "knife d8 (hand)",
		specialQuality: "",
		moves: "- Spot/avoid a hidden hazard",
	},
};
const ARTICLE_META = { slug: "spirits-of-the-wild", title: "Spirits of the wild", page: "356-371" };

describe("extractNpcBlocks", () => {
	const blocks = extractNpcBlocks(ARTICLE);

	it("keeps only NPC-shaped blocks (spirit/primordial/instinct tag lines), not artifacts", () => {
		expect(blocks.map((b) => b.name)).toEqual(["Hearth spirit", "The Halfeyd", "Primordial flame", "Alastar"]);
	});

	it("captures each block's trade-dress icon", () => {
		expect(blocks[0].icon).toContain("marker-swirl.png");
		expect(blocks[3].icon).toContain("marker-person.png");
	});

	it("strips embedded statblock asides from the body (those are separate build-npcs actors)", () => {
		expect(blocks[1].body).not.toContain("Nerth serpent");
	});
});

describe("parseNpcBlock", () => {
	const [hearth, halfeyd, flame, alastar] = extractNpcBlocks(ARTICLE).map(parseNpcBlock);

	it("parses a social spirit's run-in fields", () => {
		expect(hearth.instinct).toBe("to belong");
		expect(hearth.notes).toBe("Natters on quietly.");
		expect(hearth.moves).toBe("**Manifests** as pops & whispers.\n\n**Expects** warm greetings.");
		expect(hearth.cost).toBeNull();
	});

	it("keeps bullets, lore prose, and Something-interesting paragraphs in moves, in order", () => {
		expect(halfeyd.instinct).toBe("to terrorize its prey");
		expect(halfeyd.moves).toBe(
			"- Mark someone as prey\n- Set hunting beasts on their trail\n\n" +
			"When you make a kill, you leave an offering.\n\n" +
			"**Something interesting:** You’ll be hounded for 3 days.");
	});

	it("parses stat fields with emphasis stripped", () => {
		expect(flame.damage).toBe("1d12 w/advantage (hand, messy, ignores armor)");
		expect(flame.hp).toEqual({ value: 0, max: 0 });
	});

	it("rejoins a follower's spilled tag line and detects it by Cost", () => {
		expect(alastar.tagList).toEqual(["exceptional", "old", "devious"]);
		expect(alastar.instinct).toBe("to feel no remorse");
		expect(alastar.cost).toBe("payment in hand");
	});
});

describe("toSpiritDoc / toGuideDoc", () => {
	const blocks = extractNpcBlocks(ARTICLE);
	const spirit = toSpiritDoc(blocks[0], parseNpcBlock(blocks[0]), { article: ARTICLE_META, folder: "F1" });
	const guide = toGuideDoc(blocks[3], parseNpcBlock(blocks[3]), { article: ARTICLE_META, base: FEN_WALKER_BASE, folder: "F2" });

	it("builds an Actor doc matching the build-npcs shape, with the block icon as img", () => {
		expect(spirit._key).toBe(`!actors!${spirit._id}`);
		expect(spirit.type).toBe("npc");
		expect(spirit.img).toContain("marker-swirl.png");
		expect(spirit.system.slug).toBe("hearth-spirit");
		expect(spirit.system.reference).toBe("spirits-of-the-wild");
		expect(spirit.system.tagList.selected).toEqual(["Solitary", "spirit", "friendly", "nurturing"]);
		expect(spirit.system.instinct).toEqual({ selected: ["to belong"], options: [], multi: false, allowCustom: true });
		expect(spirit.system.description).toContain("{Spirits of the wild} (Book p.356-371)");
		expect(spirit.folder).toBe("F1");
	});

	it("regenerates with stable deterministic ids", () => {
		const again = toSpiritDoc(blocks[0], parseNpcBlock(blocks[0]), { article: ARTICLE_META, folder: "F1" });
		expect(again._id).toBe(spirit._id);
	});

	it("composes a follower Item on the fen-walker base: base stats + own tags/instinct/cost", () => {
		expect(guide._key).toBe(`!items!${guide._id}`);
		expect(guide.system.tagList.selected).toEqual(["Fen-wise", "cautious", "exceptional", "old", "devious"]); // no "(and see below)"
		expect(guide.system.hp).toEqual({ value: 8, max: 8 });
		expect(guide.system.armor).toBe("1 (leather cuirass)");
		expect(guide.system.moves).toBe("- Spot/avoid a hidden hazard");
		expect(guide.system.cost).toEqual({ selected: ["payment in hand"], options: [], multi: false, allowCustom: true });
		expect(guide.system.loyalty).toEqual({ value: 0, max: 3 });
		expect(guide.system.owned).toBe(false);
		expect(guide.system.description).toContain(`@UUID[Compendium.stonetop.wider-world-npcs.Actor.${FEN_WALKER_BASE._id}]{Fen-walker}`);
	});
});
