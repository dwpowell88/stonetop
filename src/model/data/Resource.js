export class Resource {
	constructor(data) {
		this.max     = data.max     ?? null;
		this.maxStat = data.maxStat ?? null;
		this.title   = data.title   ?? null;
		this.labels  = data.labels  ?? [];
		this.input   = data.input   ?? null; // null | { placeholder, type: "inline"|"rich", default } — a fill-in blank
	}
}
