import { enrichRichTextTree } from "./enrichRichText.js";

const TEMPLATE = "systems/stonetop/templates/chat/move-roll.hbs";

/**
 * Render a roll/description chat card. The card data carries its game text as RichText
 * (`description`, `resultText`); this runs the one enrich pass over it, then renders the template —
 * so chat cards go through the same rich-text pipeline as the sheets (markdown, @UUID links, rolls).
 */
export async function renderRollCard(data, rollData = {}) {
	await enrichRichTextTree(data, rollData);
	return foundry.applications.handlebars.renderTemplate(TEMPLATE, data);
}
