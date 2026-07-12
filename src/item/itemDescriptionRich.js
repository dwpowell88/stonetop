import { rich } from "../model/snapshot/RichText.js";

// An item sheet's non-editable description display as a RichText. The sheet's enrichRichTextTree
// pass enriches it and the template renders it with {{rich}} (the {{#if editable}} branch keeps its
// ProseMirror data-edit editor untouched). Pure so it's unit-testable without instantiating the sheet.
export function itemDescriptionRich(system) {
	return { description: rich(system?.description ?? "") };
}
