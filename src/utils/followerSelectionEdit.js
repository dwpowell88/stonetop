// Pure edit helpers for a follower's Selection field (tagList / instinct / cost). A follower stores
// these as `Selection` objects ({ selected, options, multi, allowCustom }) — NOT choice groups, so
// they are edited here via a Selection round-trip, never via choiceGroupEdit's instinct helpers
// (which emit choice-group shape and would corrupt the follower). See dont-reshape-data-for-partials.
//
// Every helper takes the stored Selection raw + returns a NEW raw so the sheet can
// `item.update({ [`system.${field}`]: raw })`. Only the string-list UI is shared with the insert sheet.

// Normalize any stored value into a plain Selection raw with the field's fixed `multi`.
export function toSelectionRaw(sel, multi) {
	const s = sel && typeof sel === "object" ? sel : {};
	return {
		selected:    [...(s.selected ?? [])],
		options:     [...(s.options ?? [])],
		multi,
		allowCustom: s.allowCustom ?? true,
	};
}

// Append a blank option row (edited in place by setOption).
export function addOption(sel, multi) {
	const r = toSelectionRaw(sel, multi);
	r.options.push("");
	return r;
}

// Remove option[index]; also drop it from `selected` so a default can't dangle.
export function removeOption(sel, index, multi) {
	const r = toSelectionRaw(sel, multi);
	const [removed] = r.options.splice(index, 1);
	r.selected = r.selected.filter(v => v !== removed);
	return r;
}

// Rename option[index]; keep any matching `selected` default in sync.
export function setOption(sel, index, value, multi) {
	const r = toSelectionRaw(sel, multi);
	if (index < 0 || index >= r.options.length) return r;
	const old = r.options[index];
	r.options[index] = value;
	r.selected = r.selected.map(v => (v === old ? value : v));
	return r;
}

// Replace the pre-selected defaults (single-select keeps at most one).
export function setSelected(sel, selected, multi) {
	const r = toSelectionRaw(sel, multi);
	const arr = (selected ?? []).map(s => String(s).trim()).filter(Boolean);
	r.selected = multi ? arr : arr.slice(0, 1);
	return r;
}

// Parse a comma-separated input into a trimmed, non-empty list.
export function parseCsv(text) {
	return String(text ?? "").split(",").map(s => s.trim()).filter(Boolean);
}
