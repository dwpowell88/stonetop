/**
 * A remembered window size for a sheet: an explicit { width, height } value object so we never pass
 * anonymous position bags between the mixin and its store. Both dimensions must be finite, positive
 * numbers — anything else is treated as "no valid size" (fromObject returns null).
 */
export class SheetSize {
	constructor(width, height) {
		this.width = width;
		this.height = height;
	}

	/** Build a SheetSize from a stored/plain object, or null when either dimension is missing/invalid. */
	static fromObject(obj) {
		if (!obj) return null;
		const { width, height } = obj;
		if (!SheetSize.#isValidDimension(width) || !SheetSize.#isValidDimension(height)) return null;
		return new SheetSize(width, height);
	}

	static #isValidDimension(n) {
		return typeof n === "number" && Number.isFinite(n) && n > 0;
	}

	/** Plain object for persistence. */
	toObject() {
		return { width: this.width, height: this.height };
	}
}
