import { FoundryPackStore } from "../../character/repositories/FoundryPackStore.js";
import { WorldItemStore } from "../../character/repositories/WorldItemStore.js";

const FIELDS = ["system.slug", "system.sortOrder", "system.choices"];

export class SteadingImprovement {
	constructor(slug, choices, sortOrder = 0) {
		this.slug      = slug;
		this.choices   = choices;
		this.sortOrder = sortOrder;
	}
}

export class FoundrySteadingImprovementRepository {
	constructor() {
		this._store      = new FoundryPackStore("stonetop.steading-improvements", FIELDS);
		this._worldStore = new WorldItemStore("improvement");
		this._cache      = null;
	}

	// The improvement catalog every steading sees: built-ins from the compendium plus any custom
	// `improvement` items authored in the world (game.items), merged and sorted together.
	async getAll() {
		if (this._cache) return this._cache;
		const entries = [...await this._store.getAll(), ...await this._worldStore.getAll()];
		this._cache = entries
			.filter(e => e.type === "improvement")
			.map(entry => new SteadingImprovement(
				entry.system?.slug,
				entry.system?.choices ?? null,
				entry.system?.sortOrder ?? 0,
			))
			.sort((a, b) => a.sortOrder - b.sortOrder);
		return this._cache;
	}
}
