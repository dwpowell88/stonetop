import { describe, it, expect } from "vitest";
import { RollDisplay } from "../../src/utils/rollDisplay.js";
import { FakeNormalRollBuilder } from "../fakes/FakeNormalRollBuilder.js";
import { FakePoolRollBuilder }  from "../fakes/FakePoolRollBuilder.js";

// RollDisplay.build now returns the dice VIEW MODEL (data), which move-roll.hbs renders. Game text
// (name/description/resultText) is no longer build()'s job — it's added by the caller as RichText
// and covered by the chat-card integration test.

const display = new RollDisplay(k => k);

const NORMAL = new FakeNormalRollBuilder().withValues(3, 5).withTotal(8).build();
// ADV (3d6kh2): 2 kept + 1 dropped
const ADV = new FakePoolRollBuilder().withKeptGroup(3, 5).withDroppedGroup(2).withTotal(8).build();
// DIS (3d6kl2): 2 kept + 1 dropped
const DIS = new FakePoolRollBuilder().withKeptGroup(2, 4).withDroppedGroup(6).withTotal(6).build();

describe("RollDisplay.build — dice groups", () => {
	it("one kept group with both dice for a normal 2d6 roll", () => {
		expect(display.build(NORMAL, {}).diceGroups).toEqual([{ kept: true, values: [3, 5] }]);
	});

	it("total comes from the roll", () => {
		expect(display.build(NORMAL, {}).total).toBe(8);
	});

	it("splits kept (first) and dropped (second) groups for an advantage roll", () => {
		expect(display.build(ADV, { rollMode: "adv" }).diceGroups).toEqual([
			{ kept: true,  values: [3, 5] },
			{ kept: false, values: [2] },
		]);
	});

	it("no dropped group for a normal roll", () => {
		expect(display.build(NORMAL, {}).diceGroups.some(g => !g.kept)).toBe(false);
	});
});

describe("RollDisplay.build — mode label", () => {
	it("localized advantage label + rollMode for an adv roll", () => {
		const d = new RollDisplay(k => (k === "stonetop.rollMode.adv" ? "Advantage" : k));
		const v = d.build(ADV, { rollMode: "adv" });
		expect(v.modeLabel).toBe("Advantage");
		expect(v.rollMode).toBe("adv");
	});

	it("localized disadvantage label for a dis roll", () => {
		const d = new RollDisplay(k => (k === "stonetop.rollMode.dis" ? "Disadvantage" : k));
		expect(d.build(DIS, { rollMode: "dis" }).modeLabel).toBe("Disadvantage");
	});

	it("null label for a normal roll", () => {
		expect(display.build(NORMAL, { rollMode: "normal" }).modeLabel).toBeNull();
	});
});

describe("RollDisplay.build — modifier", () => {
	it("formats a positive modifier with stat name", () => {
		expect(display.build(NORMAL, { bonus: 2, statKey: "wis" }).mod).toBe("+2 (WIS)");
	});

	it("formats a negative modifier", () => {
		expect(display.build(NORMAL, { bonus: -1, statKey: "str" }).mod).toBe("-1 (STR)");
	});

	it("formats +0 when the stat is 0", () => {
		expect(display.build(NORMAL, { bonus: 0, statKey: "wis" }).mod).toBe("+0 (WIS)");
	});

	it("null mod when statKey is absent", () => {
		expect(display.build(NORMAL, {}).mod).toBeNull();
	});
});
