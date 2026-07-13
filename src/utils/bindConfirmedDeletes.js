import { bindAll } from "./bindAll.js";
import { confirmDelete } from "./confirmDelete.js";

/**
 * Wire the shared destructive-delete convention onto every match of `selector`: left-click asks
 * first via confirmDelete (showing the control's `data-name`), right-click skips the confirmation.
 * Same per-render binding rules as bindAll.
 */
export function bindConfirmedDeletes(root, selector, run) {
	bindAll(root, selector, "click", async ev => {
		if (await confirmDelete(ev.currentTarget.dataset.name)) await run(ev);
	});
	bindAll(root, selector, "contextmenu", async ev => {
		ev.preventDefault();
		await run(ev);
	});
}
