import { FoundrySteadingMovesRepository } from "./repositories/FoundrySteadingMovesRepository.js";
import { rich } from "../../model/snapshot/RichText.js";

export class SteadingMoves {
	constructor(actor, repo = new FoundrySteadingMovesRepository()) {
		this._actor = actor;
		this._repo  = repo;
	}

	async buildSnapshot() {
		const entries = await this._repo.getHomefrontMoves();
		if (!entries.length) return null;

		return {
			key:             "homefront",
			label:           "Homefront Moves",
			renderStyle:     "standard",
			allowAdditional: false,
			note:            null,
			moves:           entries.map(e => this._buildMoveSnapshot(e)),
		};
	}

	// description is left as a RichText for the shared enrichRichTextTree pass (run in the sheet's
	// getData) to enrich — no bespoke enrichHTML here.
	_buildMoveSnapshot(entry) {
		return {
			id:            entry.id,
			ownedId:       null,
			slug:          entry.slug ?? entry.id,
			name:          entry.name,
			description:   rich(entry.description ?? ""),
			rollStat:      entry.rollStat || null,
			locked:        true,
			selectable:    false,
			selection:     { value: 1, max: 1 },
			requirement:   null,
			requiresLabel: null,
			sourceLabel:   null,
			resource:      entry.resource ?? null,
			choices:       null,
		};
	}
}
