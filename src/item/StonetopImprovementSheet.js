// Item sheet for authoring custom `improvement` items — the steading-improvement catalog picks up
// world improvements alongside the compendium ones (FoundrySteadingImprovementRepository). Modeled on
// the arcanum/follower sheets: a rendered VIEW (the improvement as it appears on the steading, with an
// Edit button) ⇄ a data EDITOR. Full parity with ImprovementData: a `sortOrder` (where it lands in the
// catalog) and a single `choices` group (the improvement's requirement/track rows).
//
// The view and the steading sheet render an improvement through the SAME snapshot (ChoiceGroup) +
// improvement-group.hbs partial — one render path. The editor's choice-group reuses the shared
// choiceGroupEdit helpers + choiceGroupEditorMixin + choice-group-editor partial. Foundry's ItemSheet
// auto-saves `name`/`system.*` form fields. Editor layout reuses the .stonetop-insert-sheet-* classes.

import * as CG from "../utils/choiceGroupEdit.js";
import { activateChoiceGroupEditors } from "./choiceGroupEditorMixin.js";
import { ChoiceGroup } from "../model/snapshot/character/ChoiceGroup.js";
import { enrichRichTextTree } from "../utils/enrichRichText.js";

export function createStonetopImprovementSheetClass(Base) {
	return class StonetopImprovementSheet extends Base {
		static get defaultOptions() {
			return foundry.utils.mergeObject(super.defaultOptions, {
				classes: ["stonetop", "sheet", "item", "improvement"],
				width:  600,
				height: 600,
				resizable: true,
			});
		}

		get template() {
			return "systems/stonetop/templates/item/improvement.hbs";
		}

		async getData() {
			const context = await super.getData();
			// The catalog namespaces each improvement's track values by its choice group's slug, so
			// every custom improvement needs a stable, unique slug. Generate one once (not name-derived,
			// so a rename can't collide) and seed the choices group with the same slug.
			if (!this.item.system.slug) {
				const slug = `custom-improvement-${foundry.utils.randomID(8)}`;
				await this.item.update({ "system.slug": slug, "system.choices": CG.newGroup(slug) });
			}
			const sys = this.item.system;
			context.system = sys;
			context.choicesGroup = {
				slug:   sys.choices?.slug ?? sys.slug,
				cgPath: "system.choices",
				rows:   CG.buildRows(sys.choices),
			};

			// Rendered view — the SAME snapshot (ChoiceGroup) + improvement-group.hbs partial the steading
			// renders. Empty ChoiceValues → tracks show unchecked (a catalog improvement has no track
			// state of its own; that lives on each steading that adopts it).
			context.preview = ChoiceGroup.fromPackData(sys.choices ?? { slug: sys.slug, list: [] });
			await enrichRichTextTree(context.preview, this.item?.getRollData?.() ?? {});

			// View-first: an authored improvement opens as the rendered view; a blank one (no rows yet)
			// opens in the editor. A locked (non-editable) item is always view-only.
			if (this._editMode === undefined) this._editMode = (sys.choices?.list?.length ?? 0) === 0;
			if (!this.isEditable) this._editMode = false;
			context.editMode = this._editMode;
			return context;
		}

		activateListeners(html) {
			super.activateListeners(html);

			// Edit/view toggle — only rendered when editable, so it needs no isEditable guard.
			html.find(".improvement-edit-toggle").on("click", ev => {
				this._editMode = ev.currentTarget.dataset.mode === "edit";
				this.render(false);
			});

			if (!this.isEditable) return;
			activateChoiceGroupEditors(this, html); // entry/pick row editing for the single choices group
		}
	};
}
