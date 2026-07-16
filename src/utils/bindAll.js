/**
 * Bind one handler to every current match of `selector` under `root` — the native replacement for
 * V1's `html.find(selector).on(event, handler)`. Because the listener is attached directly to each
 * element, `ev.currentTarget` is that element (exactly like jQuery's direct binding), so V1 handler
 * bodies port unchanged.
 *
 * Direct binding means this must re-run after every render that replaces the matched elements —
 * which is each sheet's `_onRender` (V2 replaces part content per render; V1 replaces the DOM).
 */
export function bindAll(root, selector, event, handler) {
	for (const el of root.querySelectorAll(selector)) el.addEventListener(event, handler);
}
