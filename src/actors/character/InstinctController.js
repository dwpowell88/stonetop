import { rich } from "../../model/snapshot/RichText.js";

export class InstinctController {
	constructor(ctrl) { this._ctrl = ctrl; }

	async selectOption(slug, siblingSlugsCsv) {
		await this._ctrl.selectOption("instinct", slug, siblingSlugsCsv);
		await this._ctrl.setText("instinct", "__custom", "");
	}

	async selectCustom(text) {
		await this._ctrl.clearValues("instinct");
		await this._ctrl.setText("instinct", "__custom", text);
	}

	async setText(optionSlug, text) {
		if (optionSlug === "__custom") await this._ctrl.clearValues("instinct");
		await this._ctrl.setText("instinct", optionSlug, text);
	}

	static computeSelected(instinctGroup, choiceValues) {
		const checked = instinctGroup?.list[0]?.options?.find(o => o.checked) ?? null;
		// option.description may be a RichText or a bare string; rich() normalizes either to its raw
		// markdown for this computed display label.
		if (checked) {
			const desc = rich(checked.description).raw;
			return desc ? `${checked.text} — ${desc}` : checked.text;
		}
		return choiceValues.toRaw()?.instinct?.__custom || null;
	}
}
