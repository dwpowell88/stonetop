// Item sheet for authoring custom `insert` items. Full parity with InsertData: rich description,
// an `instinct` choice group, an array of `choices` groups, and a list of moves referenced by slug
// (`system.moves`), a subset of which are marked starting (`system.startingMoves`, seeded acquired
// when the insert is granted). The choice-group editors reuse the shared choiceGroupEdit helpers +
// choiceGroupEditorMixin + choice-group-editor partial. Foundry's ItemSheet auto-saves `name`/
// `system.*` form fields and auto-activates the `data-edit` rich editor.

import * as CG from "../utils/choiceGroupEdit.js";
import { activateChoiceGroupEditors } from "./choiceGroupEditorMixin.js";
import { FoundryMoveRepository } from "../actors/character/repositories/FoundryMoveRepository.js";

export function createStonetopInsertSheetClass(Base) {
	return class StonetopInsertSheet extends Base {
		static get defaultOptions() {
			return foundry.utils.mergeObject(super.defaultOptions, {
				classes: ["stonetop", "sheet", "item", "insert"],
				width:  600,
				height: 680,
				resizable: true,
			});
		}

		get template() {
			return "systems/stonetop/templates/item/insert.hbs";
		}

		async getData() {
			const context = await super.getData();
			// Inserts are identified by a stable slug — their moves are tagged with it, so it must
			// survive a rename. Generate a random one once if missing (not name-derived).
			if (!this.item.system.slug) {
				await this.item.update({ "system.slug": `custom-insert-${foundry.utils.randomID(8)}` });
			}
			const sys  = this.item.system;
			context.system = sys;
			// Instinct is stored as a choice group but edited as a plain list of strings.
			context.instinctStrings = CG.instinctOptions(sys.instinct);
			context.choicesGroups = (sys.choices ?? []).map((grp, i) => ({
				index: i, slug: grp?.slug, cgPath: `system.choices.${i}`, rows: CG.buildRows(grp),
			}));
			// Moves are referenced by slug (compendium or world — not copied). `startingMoves` is the
			// subset seeded acquired when the insert is granted.
			const index    = await new FoundryMoveRepository().buildSlugIndex();
			const starting = new Set(sys.startingMoves ?? []);
			context.insertMoves = (sys.moves ?? []).map(s => {
				const m = index.get(s);
				return { slug: s, name: m?.name ?? s, missing: !m, starting: starting.has(s) };
			});
			return context;
		}

		activateListeners(html) {
			super.activateListeners(html);
			if (!this.isEditable) return;

			activateChoiceGroupEditors(this, html); // entry/pick row editing for instinct + each choices group

			// Instinct — edited as a plain list of strings (round-tripped through the choice group).
			const setInstinct = strings => this.item.update({ "system.instinct": CG.instinctFromStrings(strings) });
			html.find(".insert-instinct-add-string").on("click", () => {
				const s = CG.instinctOptions(this.item.system.instinct); s.push("");
				setInstinct(s);
			});
			html.find(".insert-instinct-remove-string").on("click", ev => {
				const s = CG.instinctOptions(this.item.system.instinct);
				s.splice(Number(ev.currentTarget.dataset.index), 1);
				setInstinct(s);
			});
			html.find(".insert-instinct-string").on("change", ev => {
				const s = CG.instinctOptions(this.item.system.instinct);
				s[Number(ev.currentTarget.dataset.index)] = ev.currentTarget.value;
				setInstinct(s);
			});

			// Group lifecycle — the choices array.
			html.find(".insert-choices-add-group").on("click", () => {
				const choices = foundry.utils.deepClone(this.item.system.choices ?? []);
				choices.push(CG.newGroup(`choices-${choices.length}`));
				this.item.update({ "system.choices": choices });
			});
			html.find(".insert-choices-remove-group").on("click", ev => {
				const choices = foundry.utils.deepClone(this.item.system.choices ?? []);
				choices.splice(Number(ev.currentTarget.dataset.index), 1);
				this.item.update({ "system.choices": choices });
			});

			// Moves are referenced purely by slug. Open resolves the slug to its document; delete just
			// removes the reference; the starting checkbox toggles the slug in `startingMoves`.
			html.find(".insert-add-move").on("click", () => this._pickOrCreateMove());
			html.find(".insert-move-open").on("click", async ev => {
				const { moveSlug } = ev.currentTarget.dataset;
				if (!moveSlug) return;
				const repo = new FoundryMoveRepository();
				const m    = (await repo.buildSlugIndex()).get(moveSlug);
				if (m) (await repo.getReferencedMoveDocument(m.id))?.sheet?.render(true);
			});
			html.find(".insert-move-delete").on("click", async ev => {
				await this._removeReferencedMove(ev.currentTarget.dataset.moveSlug);
				this.render(false);
			});
			html.find(".insert-move-starting").on("change", ev =>
				this._setStarting(ev.currentTarget.dataset.moveSlug, ev.currentTarget.checked));
		}

		// Create a new world move (a first-class item in the directory) and reference it by slug.
		async _createNewMove() {
			const slug = `custom-move-${foundry.utils.randomID(8)}`;
			const move = await Item.create({ name: "New Move", type: "move", system: { slug } });
			if (!move) return;
			await this._addExistingMove(move.system.slug);
			move.sheet?.render(true);
		}

		// Reference an existing move (compendium OR world) by its slug — no copy.
		async _addExistingMove(moveSlug) {
			if (!moveSlug) return;
			const moves = [...(this.item.system.moves ?? [])];
			if (!moves.includes(moveSlug)) moves.push(moveSlug);
			await this.item.update({ "system.moves": moves });
			this.render(false);
		}

		// Add/remove a slug from the starting subset (must already be one of the insert's moves).
		async _setStarting(moveSlug, starting) {
			if (!moveSlug) return;
			const current = new Set(this.item.system.startingMoves ?? []);
			if (starting) current.add(moveSlug); else current.delete(moveSlug);
			await this.item.update({ "system.startingMoves": [...current] });
		}

		async _removeReferencedMove(moveSlug) {
			if (moveSlug == null) return;
			await this.item.update({
				"system.moves":         (this.item.system.moves ?? []).filter(s => s !== moveSlug),
				"system.startingMoves": (this.item.system.startingMoves ?? []).filter(s => s !== moveSlug),
			});
		}

		// Dialog: create a new move, or reference an existing one by slug.
		async _pickOrCreateMove() {
			const repo  = new FoundryMoveRepository();
			const index = await repo.buildSlugIndex();
			const moves = [...index.values()].sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
			const options = moves.map(m => `<option value="${m.slug}">${foundry.utils.escapeHTML?.(m.name) ?? m.name}</option>`).join("");
			const content = `<form>
				<p>Add a move to this insert:</p>
				<select name="move" style="width:100%">
					<option value="">— Create new move —</option>
					${options}
				</select>
			</form>`;
			new Dialog({
				title: "Add move",
				content,
				buttons: {
					add: {
						label: "Add",
						callback: html => {
							const moveSlug = html[0].querySelector("select[name=move]")?.value;
							if (moveSlug) this._addExistingMove(moveSlug);
							else          this._createNewMove();
						},
					},
					cancel: { label: "Cancel" },
				},
				default: "add",
			}).render(true);
		}
	};
}
