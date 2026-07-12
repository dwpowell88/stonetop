import { describe, it, expect, vi } from "vitest";
import { createStonetopImprovementSheetClass } from "../../src/item/StonetopImprovementSheet.js";
import { ChoiceGroup } from "../../src/model/snapshot/character/ChoiceGroup.js";

// Drives the real sheet getData (slug/group seeding, preview snapshot, view/edit mode) and the
// toggle listener. Only the Foundry ItemSheet base + the item document are mocked.

function makeItem(system = {}, { name = "Improvement", img = "x.png" } = {}) {
	const item = {
		name, img,
		system: { ...system },
		getRollData: () => ({}),
		update: vi.fn(async patch => { Object.assign(item.system, expandSystem(patch)); }),
	};
	return item;
}
// Apply a flat {"system.x": v} patch onto item.system for the update spy.
function expandSystem(patch) {
	const out = {};
	for (const [k, v] of Object.entries(patch)) {
		if (k.startsWith("system.")) out[k.slice("system.".length)] = v;
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
	return new (createStonetopImprovementSheetClass(Base))();
}

// Minimal jQuery-ish collector: records handlers by selector, replays one with a fake event.
function fakeHtml() {
	const handlers = {};
	return {
		find(sel) { return { on(event, fn) { (handlers[sel] ??= {})[event] = fn; return this; } }; },
		fire(sel, event, currentTarget = {}) {
			const fn = handlers[sel]?.[event];
			if (!fn) throw new Error(`no ${event} handler for ${sel}`);
			return fn({ currentTarget, preventDefault() {}, stopPropagation() {} });
		},
	};
}

const WATCHTOWER = {
	slug: "watchtower",
	list: [{ type: "entry", slug: "built", content: { title: "Watchtower", text: "Keep the watch." }, track: { max: 2 } }],
};

describe("StonetopImprovementSheet.getData", () => {
	it("seeds a stable slug and a matching choices group for a blank improvement", async () => {
		const item = makeItem();
		const ctx  = await makeSheet(item).getData();
		expect(item.update).toHaveBeenCalledOnce();
		expect(item.system.slug).toMatch(/^custom-improvement-/);
		// The choices group is namespaced by the same slug so track values don't collide across improvements.
		expect(item.system.choices).toEqual({ slug: item.system.slug, list: [] });
		expect(ctx.choicesGroup.slug).toBe(item.system.slug);
		expect(ctx.choicesGroup.cgPath).toBe("system.choices");
		expect(ctx.choicesGroup.rows).toEqual([]);
	});

	it("preserves an existing slug and choices group", async () => {
		const choices = { slug: "watchtower", list: [{ type: "entry", slug: "built", content: { text: "Done" } }] };
		const item = makeItem({ slug: "watchtower", sortOrder: 5, choices });
		const ctx  = await makeSheet(item).getData();
		expect(item.update).not.toHaveBeenCalled();
		expect(ctx.choicesGroup.slug).toBe("watchtower");
		expect(ctx.choicesGroup.rows).toHaveLength(1);
		expect(ctx.choicesGroup.rows[0].slug).toBe("built");
		expect(ctx.system.sortOrder).toBe(5);
	});

	it("builds the rendered-view preview as the same ChoiceGroup the steading renders", async () => {
		const item = makeItem({ slug: "watchtower", choices: WATCHTOWER });
		const ctx  = await makeSheet(item).getData();
		expect(ctx.preview).toBeInstanceOf(ChoiceGroup);
		expect(ctx.preview.slug).toBe("watchtower");
		// A catalog improvement has no track state of its own — tracks preview unchecked.
		expect(ctx.preview.list[0].track.checks).toEqual([false, false]);
	});
});

describe("StonetopImprovementSheet — view/edit mode", () => {
	it("opens an authored improvement in the rendered view", async () => {
		const ctx = await makeSheet(makeItem({ slug: "watchtower", choices: WATCHTOWER })).getData();
		expect(ctx.editMode).toBe(false);
	});

	it("opens a blank improvement (no rows yet) in the editor", async () => {
		const ctx = await makeSheet(makeItem()).getData();
		expect(ctx.editMode).toBe(true);
	});

	it("forces view-only for a locked (non-editable) improvement", async () => {
		// Blank would normally open in the editor, but a locked item is always view-only.
		const ctx = await makeSheet(makeItem({ slug: "watchtower", choices: { slug: "watchtower", list: [] } }), { editable: false }).getData();
		expect(ctx.editMode).toBe(false);
	});

	it("the edit/view toggle flips mode and re-renders", async () => {
		const item  = makeItem({ slug: "watchtower", choices: WATCHTOWER });
		const sheet = makeSheet(item);
		await sheet.getData();               // opens in view (authored)
		const html = fakeHtml();
		sheet.activateListeners(html);

		html.fire(".improvement-edit-toggle", "click", { dataset: { mode: "edit" } });
		expect(sheet.render).toHaveBeenCalledOnce();
		expect((await sheet.getData()).editMode).toBe(true);

		html.fire(".improvement-edit-toggle", "click", { dataset: { mode: "view" } });
		expect((await sheet.getData()).editMode).toBe(false);
	});
});
