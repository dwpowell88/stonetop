import { describe, it, expect, vi } from "vitest";
import { createStonetopNpcSheetClass } from "../../../src/actors/npc/StonetopNpcSheet.js";
import { StonetopNpc } from "../../../src/actors/npc/StonetopNpc.js";
import { FakeNpcActorBuilder } from "../../fakes/FakeNpcActorBuilder.js";

// Drives the whole NPC sheet getData (real StonetopNpc + NpcSnapshot + RichText + the one
// enrichRichTextTree pass) and proves a damage line's dice and a description's @UUID both come out
// enriched. Only the Foundry enrichHTML boundary is mocked.
function makeSheet(actor) {
	const Base = class {
		get actor() { return actor; }
		get isEditable() { return true; }
		async getData() { return {}; }
		activateListeners() {}
		render = vi.fn();
	};
	return new (createStonetopNpcSheetClass(Base))();
}

describe("StonetopNpcSheet.getData — rich-text enrichment (integration)", () => {
	it("auto-rolls damage dice and links a description @UUID through the one pass", async () => {
		const actor = new FakeNpcActorBuilder()
			.withDamage("**maw** d10+2 (messy)")
			.withDescription("lairs in @UUID[JournalEntry.x]{the Barrow}")
			.withTypedActor(a => new StonetopNpc(a))
			.build();
		const sheet = makeSheet(actor);

		const orig = foundry.applications.ux.TextEditor.implementation.enrichHTML;
		foundry.applications.ux.TextEditor.implementation.enrichHTML = async html => html
			.replace(/\[\[\/r ([^\]]+)\]\]/g, '<a class="inline-roll">$1</a>')
			.replace(/@UUID\[[^\]]+\]\{([^}]+)\}/g, '<a class="content-link">$1</a>');
		let ctx;
		try {
			ctx = await sheet.getData();
		} finally {
			foundry.applications.ux.TextEditor.implementation.enrichHTML = orig;
		}

		// damage carries roll:true, so the bare d10+2 becomes a roll link.
		expect(ctx.stonetop.damage.render()).toContain('<a class="inline-roll">d10+2</a>');
		expect(ctx.stonetop.damage.render()).toContain("<strong>maw</strong>");
		// description (roll:false) keeps prose but resolves the @UUID link.
		expect(ctx.stonetop.description.render()).toContain('<a class="content-link">the Barrow</a>');
	});
});
