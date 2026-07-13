// Shared "are you sure?" gate for destructive deletes on the sheets. Resolves `true` to proceed,
// `false` to cancel (including dismissing the dialog). Uses Foundry's DialogV2 so it matches the
// app's look; the safe choice (No) is the default. Pass the item's `name` to show it in the prompt
// so the player knows exactly what they're removing. Right-clicking a delete control bypasses this
// entirely (the caller skips the call).
function escapeHtml(s) {
	return String(s).replace(/[&<>"']/g, c => (
		{ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
	));
}

export async function confirmDelete(name) {
	const body = name
		? game.i18n.format("stonetop.confirm.deleteNamed", { name: escapeHtml(name) })
		: game.i18n.localize("stonetop.confirm.deleteGeneric");
	// DialogV2.confirm defaults the No button and resolves undefined on dismissal — normalize both
	// to a strict boolean so callers only ever see true/false.
	const result = await foundry.applications.api.DialogV2.confirm({
		window: { title: game.i18n.localize("stonetop.confirm.deleteTitle") },
		content: `<p>${body}</p>`,
	});
	return result === true;
}
