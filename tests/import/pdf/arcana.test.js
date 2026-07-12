import { describe, it, expect } from "vitest";
import { linkArcana, linkArtifactHeadings } from "../../../scripts/import/pdf/arcana.js";
import { deterministicId } from "../../../scripts/import/ids.js";

const index = [
	{ name: "Ring of Daagon", uuid: "Compendium.stonetop.arcana.Item.aaaaaaaaaaaaaaaa" },
	{ name: "Mindgem", uuid: "Compendium.stonetop.arcana.Item.bbbbbbbbbbbbbbbb" },
].sort((a, b) => b.name.length - a.name.length);

describe("linkArcana", () => {
	it("links the first mention of an arcanum name to its item", () => {
		const { html, linked } = linkArcana("the heart of the Mindgem lies here", index);
		expect(linked).toBe(1);
		expect(html).toBe("the heart of the @UUID[Compendium.stonetop.arcana.Item.bbbbbbbbbbbbbbbb]{Mindgem} lies here");
	});

	it("links only the first occurrence per arcanum (avoids over-linking)", () => {
		const { html, linked } = linkArcana("Mindgem ... and the Mindgem again", index);
		expect(linked).toBe(1);
		expect(html).toBe("@UUID[Compendium.stonetop.arcana.Item.bbbbbbbbbbbbbbbb]{Mindgem} ... and the Mindgem again");
	});

	it("is case-sensitive (won't link a lowercase common-word occurrence)", () => {
		const { linked } = linkArcana("they found a mindgem-like stone", index);
		expect(linked).toBe(0);
	});

	it("does not link inside HTML tags or existing enricher tokens", () => {
		const input = `<a href="Mindgem">x</a> @UUID[Compendium.stonetop.x.Item.cccccccccccccccc]{Mindgem}`;
		const { html, linked } = linkArcana(input, index);
		expect(linked).toBe(0);          // both occurrences are protected
		expect(html).toBe(input);
	});

	it("links a name even when wrapped in emphasis tags", () => {
		const { html } = linkArcana("<strong><em>Mindgem</em></strong>", index);
		expect(html).toBe("<strong><em>@UUID[Compendium.stonetop.arcana.Item.bbbbbbbbbbbbbbbb]{Mindgem}</em></strong>");
	});
});

describe("linkArcana — descriptive Minor Arcana (page-gated)", () => {
	const descIndex = [
		{ name: "A gold ring", uuid: "Compendium.stonetop.arcana.Item.dddddddddddddddd", descriptive: true },
	];

	it("links a descriptive name only when followed by a (page N) citation", () => {
		const { html, linked } = linkArcana("they recover a gold ring (page 374) from the hoard", descIndex);
		expect(linked).toBe(1);
		expect(html).toBe("they recover @UUID[Compendium.stonetop.arcana.Item.dddddddddddddddd]{a gold ring} (page 374) from the hoard");
	});

	it("does NOT link a bare descriptive name in ordinary prose", () => {
		const { html, linked } = linkArcana("she wore a gold ring on her hand", descIndex);
		expect(linked).toBe(0);
		expect(html).toBe("she wore a gold ring on her hand");
	});

	it("tolerates a closing emphasis tag between the name and the citation", () => {
		const { linked } = linkArcana("<em>A gold ring</em> (page 374)", descIndex);
		expect(linked).toBe(1);
	});
});

describe("linkArtifactHeadings", () => {
	const braceletId = deterministicId("possessions", "artifact:a-lead-bracelet");

	it("links a bare artifact heading to its possession item (deterministic id)", () => {
		const { html, linked } = linkArtifactHeadings(
			'<h3>A lead bracelet</h3><p class="artifact-tags"><em>magical</em>, Value 1</p><p>A torc.</p>');
		expect(linked).toBe(1);
		expect(html).toContain(`<h3>@UUID[Compendium.stonetop.possessions.Item.${braceletId}]{A lead bracelet}</h3>`);
	});

	it("keeps the heading's marker icon outside the link", () => {
		const { html } = linkArtifactHeadings(
			'<h3><img class="icon" src="x.png">A lead bracelet</h3><p class="artifact-tags">Value 1</p>');
		expect(html).toContain('<h3><img class="icon" src="x.png">@UUID[');
	});

	it("skips NPC-shaped blocks (spirits/followers share the markup)", () => {
		const { linked } = linkArtifactHeadings(
			'<h3>Hearth spirit</h3><p class="artifact-tags">Solitary, spirit, friendly</p>');
		expect(linked).toBe(0);
	});

	it("skips headings linkArcana already wrapped (no double link)", () => {
		const input = '<h3>@UUID[Compendium.stonetop.possessions.Item.abcdefabcdefabcd]{Crystal knife}</h3><p class="artifact-tags">Value 2</p>';
		const { html, linked } = linkArtifactHeadings(input);
		expect(linked).toBe(0);
		expect(html).toBe(input);
	});
});
