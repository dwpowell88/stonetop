import { describe, it, expect } from "vitest";
import { parseDividers, parseMarkers } from "../../../scripts/import/pdf/rules.js";

const stroke = (color, e, f, w) =>
	`<stroke_path linewidth=".5" colorspace="DeviceRGB" color="${color}" transform="1 0 0 -1 ${e} ${f}">` +
	`<moveto x="0" y="0"/><lineto x="${w}" y="0"/></stroke_path>`;
const braid = (e, f, w, h) =>
	`<fill_image_mask transform="${w} 0 -0 2.9 ${e} ${f}" colorspace="DeviceRGB" color="0 0 0" width="651" height="${h}"/>`;

describe("parseDividers", () => {
	it("keeps black, full-width horizontal strokes as line dividers at (e, f)", () => {
		expect(parseDividers(stroke("0 0 0", 204, 106, 156))).toEqual([{ x: 204, y: 106, width: 156, kind: "line" }]);
	});

	it("keeps braid image masks as braid dividers", () => {
		expect(parseDividers(braid(204, 83, 156, 13))).toEqual([{ x: 204, y: 83, width: 156, kind: "braid" }]);
	});

	it("drops white (decorative) strokes and narrow table-internal lines", () => {
		expect(parseDividers(stroke("1 1 1", 36, 326, 156))).toEqual([]);
		expect(parseDividers(stroke("0 0 0", 63, 326, 127))).toEqual([]);
	});

	it("drops non-horizontal strokes", () => {
		const diag = `<stroke_path color="0 0 0" transform="1 0 0 -1 36 100"><moveto x="0" y="0"/><lineto x="156" y="40"/></stroke_path>`;
		expect(parseDividers(diag)).toEqual([]);
	});
});

describe("parseMarkers", () => {
	// A small straight-sided ~square box (≥3 lineto) → "square" (the choice-group pick/track checkbox).
	const square = `<stroke_path color="0 0 0" transform="1 0 0 -1 600 313">` +
		`<moveto x="0" y="0"/><lineto x="6" y="0"/><lineto x="6" y="-6"/><lineto x="0" y="-6"/><lineto x="0" y="0"/></stroke_path>`;
	// A curved outline filling its bbox → "circle"; a curved outline filling ~half → "diamond".
	const circle = `<stroke_path color="0 0 0" transform="1 0 0 -1 100 200">` +
		`<moveto x="0" y="0"/><curveto x1="6" y1="0" x2="6" y2="-6" x3="0" y3="-6"/>` +
		`<curveto x1="0" y1="-6" x2="0" y2="0" x3="6" y3="0"/><curveto x1="6" y1="0" x2="3" y2="-3" x3="6" y3="-6"/></stroke_path>`;
	const diamond = `<stroke_path color="0 0 0" transform="1 0 0 -1 50 80">` +
		`<moveto x="3" y="0"/><curveto x1="3" y1="0" x2="6" y2="-3" x3="6" y3="-3"/>` +
		`<curveto x1="6" y1="-3" x2="3" y2="-6" x3="3" y3="-6"/><curveto x1="3" y1="-6" x2="0" y2="-3" x3="0" y3="-3"/></stroke_path>`;

	it("detects square checkboxes (straight-sided box)", () => {
		expect(parseMarkers(square)).toEqual([{ x: 600, y: 313, w: 6, h: 6, kind: "square" }]);
	});

	it("classifies curved outlines as circle (fills bbox) vs diamond (fills ~half)", () => {
		expect(parseMarkers(circle)[0].kind).toBe("circle");
		expect(parseMarkers(diamond)[0].kind).toBe("diamond");
	});

	it("ignores white markers and oblong (non-square) straight shapes", () => {
		expect(parseMarkers(square.replace('color="0 0 0"', 'color="1 1 1"'))).toEqual([]);
		const oblong = `<stroke_path color="0 0 0" transform="1 0 0 -1 600 313">` +
			`<moveto x="0" y="0"/><lineto x="14" y="0"/><lineto x="14" y="-3"/><lineto x="0" y="-3"/><lineto x="0" y="0"/></stroke_path>`;
		expect(parseMarkers(oblong)).toEqual([]);
	});
});
