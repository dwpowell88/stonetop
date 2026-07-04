export class ResourceSnapshot {
	constructor(b) {
		this.current = b._current;
		this.max     = b._max;
		this.maxStat = b._maxStat ?? null;
		this.title   = b._title;
		this.labels  = b._labels;
		this.input   = b._input ?? null; // null | { value, placeholder, type: "inline"|"rich" } — a fill-in blank
	}
}

export class ResourceBuilder {
	withCurrent(v) { this._current = v; return this; }
	withMax(v)     { this._max     = v; return this; }
	withMaxStat(v) { this._maxStat = v; return this; }
	withTitle(v)   { this._title   = v; return this; }
	withLabels(v)  { this._labels  = v; return this; }
	withInput(v)   { this._input   = v; return this; }
	build()        { return new ResourceSnapshot(this); }
}
