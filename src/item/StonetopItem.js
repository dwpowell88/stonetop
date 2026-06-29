import {StonetopPlaybook} from "./StonetopPlaybook.js";
import {renderRollCard} from "../utils/rollCard.js";
import {rich} from "../model/snapshot/RichText.js";

export function createStonetopItemClass(BaseItem) {
	return class StonetopItem extends BaseItem {

		asPlaybook() {
			return new StonetopPlaybook(this);
		}

		async roll({ rollMode = "normal", descriptionOnly = false } = {}) {
			if (!this.actor) {
				const speaker = ChatMessage.getSpeaker({ actor: undefined });
				const card = { name: this.name, description: rich(this.system?.description ?? "") };
				return ChatMessage.create({ speaker, content: await renderRollCard(card, this.getRollData?.() ?? {}) });
			}
			return this.actor._executeRoll(this, { rollMode, descriptionOnly });
		}
	};
}
