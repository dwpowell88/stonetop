import { Move } from "../../../model/data/Move.js";
import { FoundryPackStore } from "./FoundryPackStore.js";
import { WorldItemStore } from "./WorldItemStore.js";

const MOVE_FIELDS = ["system.requirement", "system.rollStat", "system.description",
                     "system.repeatMax", "system.resource", "system.choices",
                     "system.moveResults", "system.moveType"];

export class FoundryMoveRepository {
	constructor() {
		this._moveStore      = new FoundryPackStore("stonetop.moves", MOVE_FIELDS);
		this._worldMoveStore = new WorldItemStore("move");
	}

	async getMovesByType(moveType) {
		const [entries, worldEntries] = await Promise.all([
			this._moveStore.filterEntries(e => e.system?.moveType === moveType),
			this._worldMoveStore.filterEntries(e => e.system?.moveType === moveType),
		]);
		return [...entries, ...worldEntries].map(e => new Move(e));
	}

	async getBasicMoves() {
		return this.getMovesByType("basic");
	}

	// Resolve referenced moves (playbook/insert `moves`, arcana `back.moveSlugs`) to Move objects,
	// across compendium + world. Unknown slugs are dropped. Preserves the requested order.
	async getMovesBySlugs(slugs = []) {
		if (!slugs?.length) return [];
		const index = await this.buildSlugIndex();
		return slugs.map(s => index.get(s)).filter(Boolean);
	}

	// Fetch the full document for a referenced move (compendium OR world), so it can be embedded onto
	// an actor. Try the pack, fall back to the world.
	async getReferencedMoveDocument(id) {
		let doc = null;
		try { doc = await this._moveStore.getDocument(id); } catch { /* not a compendium id */ }
		return doc ?? this._worldMoveStore.getDocument(id);
	}

	async buildSlugIndex() {
		const [all, world] = await Promise.all([
			this._moveStore.getAll(),
			this._worldMoveStore.getAll(),
		]);
		return new Map([...all, ...world].map(e => new Move(e)).map(m => [m.slug, m]));
	}
}
