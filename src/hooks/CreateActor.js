import { applySteadfast, loadSteadfast } from "../actors/steading/applySteadfast.js";

// Runs once, on the creating client, post-create (not preCreate — loading packs is async).
//
// Two create-time jobs:
//   1. A brand-new steading gets the Stonetop steadfast, so it opens with the same out-of-the-box
//      values steadings used to get from hardcoded schema defaults. One that already has a steadfast
//      (duplicated, imported, or created from a template) is left alone.
//   2. Characters and steadings get their reference moves (basic/special/follower; homefront) seeded
//      as owned `move` items. Seeding at creation — rather than reconciling on every render — is what
//      lets a GM edit, delete, or re-add these moves without a render pass silently re-asserting them.
//      Idempotent, so a duplicated/imported actor that already carries them isn't re-seeded.
export async function onCreateActor(document, options, userId) {
	if (game.user?.id !== userId) return;

	if (document.type === "steading" && !document.system?.steadfast) {
		const steadfast = await loadSteadfast("stonetop");
		if (steadfast) await applySteadfast(document, steadfast);
	}

	const typed = document.typedActor;
	if (typed?.seedReferenceMoves) await typed.seedReferenceMoves();
}
