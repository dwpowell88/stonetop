// Data model for a `follower` Item — the shared creature stat block (creatureFields) PLUS follower
// bookkeeping (followerFields: loyalty, choices/choiceValues, members, memberSuggestions, companion,
// owned, arcanaSlug, …). An NPC actor uses NpcData (creatureFields only), so those follower-only
// fields are what make this a follower, not an NPC.
//
// The Item type was historically `npc`; it was renamed to `follower` because the fields it carries
// are follower-only. `npc` is kept registered as a legacy alias so pre-rename worlds still load their
// items, which the world migration (migrateFollowerItemType) then converts to `follower`. See
// follower-npc-model.md.

import { creatureFields, followerFields, migrateCreatureData } from "./creature.js";

export class FollowerData extends foundry.abstract.TypeDataModel {
	static defineSchema() {
		return { ...creatureFields(), ...followerFields() };
	}

	static migrateData(source) {
		return super.migrateData(migrateCreatureData(source));
	}
}
