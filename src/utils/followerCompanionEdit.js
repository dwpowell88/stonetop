// Pure edit helpers for a follower's animal-companion authoring data. `companion` is ONE opaque
// ObjectField — writers read-modify-write the WHOLE object (see creature.js §companion and
// CharacterFollowers), so every helper clones the whole companion and returns a NEW one for
// `item.update({ "system.companion": companion })`.
//
// The editor owns `enabled` + `catalog`; `type`/`options` are runtime picks (set in play), not
// authored here. Each catalog entry is a stat template:
//   { slug, name, variants:[], hp:{value,max}, armor, damage, pickCount, options:[], defaults:[] }

const clone = c => foundry.utils.deepClone(c ?? {});

// The canonical blank companion object (enabled off, empty runtime selections + catalog). One home for
// the shape so the sheet, the snapshot, and CharacterFollowers don't each spell it out differently.
export function blankCompanion() {
	return {
		enabled: false,
		type:    { selected: [], options: [], multi: false, allowCustom: true },
		options: { selected: [], options: [], multi: true,  allowCustom: true },
		catalog: [],
	};
}

export function newType() {
	return {
		slug: `type-${foundry.utils.randomID(6)}`, name: "",
		variants: [], hp: { value: 0, max: 0 }, armor: "", damage: "",
		pickCount: 0, options: [], defaults: [],
	};
}

export function setEnabled(companion, on) {
	const c = clone(companion);
	c.enabled = !!on;
	return c;
}

export function addType(companion) {
	const c = clone(companion);
	c.catalog = [...(c.catalog ?? []), newType()];
	return c;
}

export function removeType(companion, index) {
	const c = clone(companion);
	c.catalog = [...(c.catalog ?? [])];
	c.catalog.splice(index, 1);
	return c;
}

// Set one field on catalog[index] (dotted, e.g. "hp.max" or "name"), given an already-coerced value.
// `variants`/`options`/`defaults` are string arrays (the caller splits its input first).
export function setTypeField(companion, { index, field, value }) {
	const c = clone(companion);
	const cat = c.catalog ?? [];
	if (cat[index]) foundry.utils.setProperty(cat[index], field, value);
	return c;
}
