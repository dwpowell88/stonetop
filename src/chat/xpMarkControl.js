/**
 * The "Mark XP" control on roll cards.
 *
 * The book's rule — mark XP when you roll a 6-, unless the move says otherwise — wants a
 * nudge, not automation: players roll moves for fun or by accident, and some tables rule
 * exceptions (the Seeker's Never at a Loss makes declining the mark the player's choice on
 * Know Things rolls). So a 6- roll card carries a flags.stonetop.xpMark flag and offers a
 * Mark XP button (rendered through buildXpLine) to the GM and the rolling player; clicking
 * it marks the XP and flips the line to "You mark XP." with an Undo link for misclicks.
 */

export function buildXpLine(marked, localize) {
	return marked
		? `<div class="stonetop-roll-xp">${localize("stonetop.rollResults.xpMarked")} ` +
			`<a class="stonetop-xp-toggle">${localize("stonetop.rollResults.xpUndo")}</a></div>`
		: `<div class="stonetop-roll-xp stonetop-roll-xp--offer">` +
			`<button type="button" class="stonetop-xp-toggle">${localize("stonetop.rollResults.xpMark")}</button></div>`;
}

const XP_LINE = /<div class="stonetop-roll-xp[^"]*">.*?<\/div>/;

export function swapXpLine(content, marked, localize) {
	return content.replace(XP_LINE, buildXpLine(marked, localize));
}

/** renderChatMessageHTML: strip the control for users who may not act on it, bind it for the rest. */
export function onRenderChatMessage(message, html) {
	const toggle = html.querySelector?.(".stonetop-xp-toggle");
	if (!toggle) return;
	if (!canToggle(message)) {
		toggle.remove();
		return;
	}
	toggle.addEventListener("click", () => toggleXpMark(message));
}

function canToggle(message) {
	return !!(globalThis.game?.user?.isGM || message.isAuthor);
}

export async function toggleXpMark(message) {
	const flag = message.getFlag("stonetop", "xpMark");
	if (!flag) return;
	const typed = ChatMessage.getSpeakerActor?.(message.speaker)?.typedActor;
	if (!typed) return;
	const marked = !flag.marked;
	// Marking goes through the same path as the sheet's tick; Undo removes it. If the actor
	// state moved on (the XP was already spent back to 0 before an undo), do nothing.
	const applied = marked ? await typed.markXp?.() : await typed.unmarkXp?.();
	if (applied !== true) return;
	await message.update({
		content: swapXpLine(message.content, marked, k => globalThis.game.i18n.localize(k)),
		"flags.stonetop.xpMark": { ...flag, marked },
	});
}
