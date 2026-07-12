import { RichText } from "../model/snapshot/RichText.js";

/**
 * Enrich every RichText in a snapshot tree in one pass. Recursively collects all RichText instances
 * (objects + arrays, cycle/dedupe-safe), then enriches them in parallel via the shared pipeline.
 * Called once per sheet in getData over the single top-level snapshot, so adding rich text anywhere
 * needs nothing at the render site — wrap it in `rich()` in the builder and it gets picked up here.
 *
 * Mutates the RichText nodes in place (snapshots are throwaway render data) and returns the tree.
 */
export async function enrichRichTextTree(node, rollData = {}) {
	const found = [];
	collect(node, found, new Set());
	await Promise.all(found.map(rt => rt.enrich(rollData)));
	return node;
}

function collect(node, out, seen) {
	if (node === null || typeof node !== "object") return;
	if (seen.has(node)) return;
	seen.add(node);
	if (node instanceof RichText) { out.push(node); return; }
	if (Array.isArray(node)) {
		for (const v of node) collect(v, out, seen);
	} else {
		for (const k of Object.keys(node)) collect(node[k], out, seen);
	}
}
