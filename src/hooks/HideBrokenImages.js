let installed = false;

// Hide any <img> that fails to load (its file 404s) by tagging it with a class that CSS hides.
// Our copyrighted illustrations live in the gitignored stonetop-art/ store, so on instances that
// haven't populated it those refs (journal art, playbook icon, arcana/steading art) would otherwise
// show Foundry's broken-image placeholder. `error` events don't bubble, so listen in the capture
// phase on the document to catch every image, regardless of which window rendered it.
export function installBrokenImageHider() {
	if (installed) return;
	installed = true;
	document.addEventListener("error", (event) => {
		const el = event.target;
		if (el instanceof HTMLImageElement) el.classList.add("stonetop-broken-img");
	}, true);
}
