// @vitest-environment happy-dom
// happy-dom gives us a `document` — activateListeners installs the global combobox handlers
// (activateComboBoxes), which addEventListener on document at install time.
import { describe, it, expect, vi } from "vitest";
import { createStonetopFollowerSheetClass } from "../../src/item/StonetopFollowerSheet.js";
import { FollowerSnapshot } from "../../src/model/snapshot/character/FollowerSnapshot.js";

// Drives the real sheet getData/activateListeners (real buildFollowerSnapshot + helpers + the one
// enrichRichTextTree pass). Only the Foundry ItemSheet base + the item document are mocked.

function makeItem(system = {}, { name = "Follower", img = "x.png" } = {}) {
	const item = {
		name, img,
		system: { companion: { enabled: false, catalog: [] }, ...system },
		getRollData: () => ({}),
		update: vi.fn(async patch => { foundry.utils.mergeObject(item.system, expandSystem(patch)); }),
	};
	return item;
}
// Apply a flat {"system.x.y": v} patch onto item.system for the update spy (good enough for tests).
function expandSystem(patch) {
	const out = {};
	for (const [k, v] of Object.entries(patch)) {
		if (k.startsWith("system.")) foundry.utils.setProperty(out, k.slice("system.".length), v);
	}
	return out;
}

function makeSheet(item, { editable = true } = {}) {
	const Base = class {
		get item() { return item; }
		get isEditable() { return editable; }
		async getData() { return { editable }; }
		activateListeners() {}
		render = vi.fn();
	};
	return new (createStonetopFollowerSheetClass(Base))();
}

// Minimal jQuery-ish collector: records handlers by selector, replays one with a fake event.
// `[0]` is a real (empty) element — activateChoiceGroupEditors takes the native root now and
// finds no editor controls there, which is fine: these tests drive the sheet's own handlers.
function fakeHtml() {
	const handlers = {};
	return {
		0: document.createElement("div"),
		find(sel) { return { on(event, fn) { (handlers[sel] ??= {})[event] = fn; return this; } }; },
		fire(sel, event, currentTarget = {}) {
			const fn = handlers[sel]?.[event];
			if (!fn) throw new Error(`no ${event} handler for ${sel}`);
			return fn({ currentTarget, preventDefault() {}, stopPropagation() {} });
		},
	};
}

describe("StonetopFollowerSheet.getData", () => {
	it("builds an enriched follower-card preview from the item (view mode for a content follower)", async () => {
		const item = makeItem({ slug: "enfys", hp: { value: 4, max: 6 }, armor: "1", damage: "d6", loyalty: { value: 2, max: 3 } });
		const ctx = await makeSheet(item).getData();
		expect(ctx.preview).toBeInstanceOf(FollowerSnapshot);
		expect(ctx.preview.name).toBe("Follower");
		expect(ctx.preview.hp).toBe(4);
		expect(ctx.preview.loyalty.current).toBe(2);
		expect(ctx.editMode).toBe(false);
	});

	it("opens a blank follower in the editor", async () => {
		const ctx = await makeSheet(makeItem({ slug: "x" })).getData();
		expect(ctx.editMode).toBe(true);
	});

	it("stays view-only (editMode false) when not editable, even if blank", async () => {
		const ctx = await makeSheet(makeItem({ slug: "x" }), { editable: false }).getData();
		expect(ctx.editMode).toBe(false);
	});

	it("auto-generates a stable slug when missing", async () => {
		const item = makeItem({});
		delete item.system.slug;
		await makeSheet(item).getData();
		expect(item.update).toHaveBeenCalledWith(expect.objectContaining({ "system.slug": expect.stringMatching(/^custom-follower-/) }));
	});

	it("normalizes the three Selection fields with the right multi + builds choiceRows", async () => {
		const item = makeItem({
			slug: "crew",
			tagList: { selected: ["group"], options: ["group", "brave"], multi: true, allowCustom: true },
			instinct: { selected: [], options: ["To lord over others"], multi: false, allowCustom: true },
			choices: [{ slug: "choices", list: [{ type: "pick", pickCount: 1, options: [{ slug: "a", text: "A" }] }] }],
		});
		const ctx = await makeSheet(item).getData();
		expect(ctx.tagListSel.multi).toBe(true);
		expect(ctx.tagListSel.options).toEqual(["group", "brave"]);
		expect(ctx.instinctSel.multi).toBe(false);
		expect(ctx.hasChoices).toBe(true);
		expect(ctx.choiceRows.length).toBeGreaterThan(0);
	});
});

describe("StonetopFollowerSheet.activateListeners wiring", () => {
	function wired(system) {
		const item = makeItem(system);
		const sheet = makeSheet(item);
		const html = fakeHtml();
		sheet.activateListeners(html);
		return { item, html };
	}

	it("member add writes the members array (at group max HP) AND ensures the group tag", () => {
		const { item, html } = wired({ slug: "crew", hp: { value: 6, max: 6 }, members: [] });
		html.fire(".follower-member-add", "click");
		expect(item.update).toHaveBeenCalledWith({
			"system.members": [expect.objectContaining({ hp: { value: 6, max: 6 } })],
			"system.tagList": expect.objectContaining({ selected: ["group"], multi: true }),
		});
	});

	it("companion enable toggles the whole companion object", () => {
		const { item, html } = wired({ slug: "x" });
		html.fire(".follower-companion-enable", "change", { checked: true });
		expect(item.update).toHaveBeenCalledWith({ "system.companion": expect.objectContaining({ enabled: true }) });
	});

	it("editing a selection option saves a Selection raw for the field from the wrapper", () => {
		const { item, html } = wired({ slug: "x", instinct: { selected: [], options: ["old"], multi: false, allowCustom: true } });
		const currentTarget = {
			value: "new",
			dataset: { stringIndex: "0" },
			closest: () => ({ dataset: { selectionField: "instinct" } }),
		};
		html.fire(".follower-option-input", "change", currentTarget);
		expect(item.update).toHaveBeenCalledWith({ "system.instinct": expect.objectContaining({ options: ["new"], multi: false }) });
	});

	it("adding the choices group writes a fresh group at system.choices.0", () => {
		const { item, html } = wired({ slug: "x" });
		html.fire(".follower-choices-add", "click");
		expect(item.update).toHaveBeenCalledWith({ "system.choices": [expect.objectContaining({ slug: "choices" })] });
	});
});
