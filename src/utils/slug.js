export function toSlug(name) {
	return String(name).toLowerCase()
		.replace(/['‘’]/g, "")   // drop straight + curly apostrophes so "Storm's Fury" → "storms-fury"
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
}
