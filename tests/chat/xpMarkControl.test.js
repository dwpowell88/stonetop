import { describe, it, expect, vi, afterEach } from "vitest";
import { buildXpLine, swapXpLine, onRenderChatMessage, toggleXpMark } from "../../src/chat/xpMarkControl.js";

afterEach(() => vi.unstubAllGlobals());

const loc = k => k;

// -- fakes -----------------------------------------------------------------------

function makeTyped({ xp = 3 } = {}) {
	return {
		xp,
		async markXp()   { this.xp++; return true; },
		async unmarkXp() { if (this.xp <= 0) return false; this.xp--; return true; },
	};
}

function makeMessage({ marked = false, flag = true, isAuthor = false } = {}) {
	const flags = flag ? { stonetop: { xpMark: { marked } } } : {};
	return {
		content: `<h3>Defy Danger</h3>${buildXpLine(marked, loc)}`,
		speaker: { actor: "a1" },
		isAuthor,
		getFlag: (scope, key) => flags[scope]?.[key],
		update: vi.fn(async function (data) { Object.assign(this, { lastUpdate: data }); }),
	};
}

function stubWorld(typed, { isGM = false } = {}) {
	vi.stubGlobal("game", { user: { isGM }, i18n: { localize: loc } });
	vi.stubGlobal("ChatMessage", { getSpeakerActor: () => (typed ? { typedActor: typed } : null) });
}

// -- buildXpLine / swapXpLine ------------------------------------------------------

describe("buildXpLine", () => {
	it("unmarked state offers a Mark XP button", () => {
		const html = buildXpLine(false, loc);
		expect(html).toContain("stonetop.rollResults.xpMark");
		expect(html).toContain("<button");
		expect(html).toContain("stonetop-xp-toggle");
		expect(html).toContain("stonetop-roll-xp--offer");
	});

	it("marked state carries the marked text and an undo link", () => {
		const html = buildXpLine(true, loc);
		expect(html).toContain("stonetop.rollResults.xpMarked");
		expect(html).toContain("stonetop.rollResults.xpUndo");
		expect(html).not.toContain("<button");
	});
});

describe("swapXpLine", () => {
	it("flips an offer card to marked and back, leaving the rest alone", () => {
		const card = `<h3>Defy Danger</h3>${buildXpLine(false, loc)}<div class="other">x</div>`;
		const marked = swapXpLine(card, true, loc);
		expect(marked).toContain("stonetop.rollResults.xpMarked");
		expect(marked).not.toContain("stonetop.rollResults.xpMark\"");
		expect(marked).toContain('<div class="other">x</div>');
		expect(swapXpLine(marked, false, loc)).toBe(card);
	});
});

// -- toggleXpMark ------------------------------------------------------------------

describe("toggleXpMark", () => {
	it("the button marks a tick and rewrites card + flag", async () => {
		const typed = makeTyped({ xp: 3 });
		stubWorld(typed);
		const message = makeMessage();
		await toggleXpMark(message);
		expect(typed.xp).toBe(4);
		expect(message.update).toHaveBeenCalledOnce();
		const data = message.update.mock.calls[0][0];
		expect(data.content).toContain("stonetop.rollResults.xpMarked");
		expect(data["flags.stonetop.xpMark"]).toEqual({ marked: true });
	});

	it("undo takes the tick back", async () => {
		const typed = makeTyped({ xp: 3 });
		stubWorld(typed);
		const message = makeMessage({ marked: true });
		await toggleXpMark(message);
		expect(typed.xp).toBe(2);
		expect(message.update.mock.calls[0][0]["flags.stonetop.xpMark"]).toEqual({ marked: false });
	});

	it("does nothing when the card has no xpMark flag", async () => {
		const typed = makeTyped();
		stubWorld(typed);
		const message = makeMessage({ flag: false });
		await toggleXpMark(message);
		expect(typed.xp).toBe(3);
		expect(message.update).not.toHaveBeenCalled();
	});

	it("does nothing when the actor cannot be resolved", async () => {
		stubWorld(null);
		const message = makeMessage();
		await toggleXpMark(message);
		expect(message.update).not.toHaveBeenCalled();
	});

	it("leaves the card alone when the undo cannot land (XP already spent to 0)", async () => {
		const typed = makeTyped({ xp: 0 });
		stubWorld(typed);
		const message = makeMessage({ marked: true });
		await toggleXpMark(message);
		expect(typed.xp).toBe(0);
		expect(message.update).not.toHaveBeenCalled();
	});
});

// -- onRenderChatMessage -----------------------------------------------------------

describe("onRenderChatMessage", () => {
	function makeHtml() {
		const toggle = { remove: vi.fn(), addEventListener: vi.fn() };
		return { toggle, html: { querySelector: sel => (sel === ".stonetop-xp-toggle" ? toggle : null) } };
	}

	it("binds the control for the GM", () => {
		stubWorld(makeTyped(), { isGM: true });
		const { toggle, html } = makeHtml();
		onRenderChatMessage(makeMessage(), html);
		expect(toggle.addEventListener).toHaveBeenCalledWith("click", expect.any(Function));
		expect(toggle.remove).not.toHaveBeenCalled();
	});

	it("binds the control for the message author (the rolling player)", () => {
		stubWorld(makeTyped(), { isGM: false });
		const { toggle, html } = makeHtml();
		onRenderChatMessage(makeMessage({ isAuthor: true }), html);
		expect(toggle.addEventListener).toHaveBeenCalled();
	});

	it("removes the control for everyone else", () => {
		stubWorld(makeTyped(), { isGM: false });
		const { toggle, html } = makeHtml();
		onRenderChatMessage(makeMessage({ isAuthor: false }), html);
		expect(toggle.remove).toHaveBeenCalled();
		expect(toggle.addEventListener).not.toHaveBeenCalled();
	});

	it("is a no-op for cards without the control", () => {
		stubWorld(makeTyped(), { isGM: true });
		expect(() => onRenderChatMessage(makeMessage(), { querySelector: () => null })).not.toThrow();
	});
});
