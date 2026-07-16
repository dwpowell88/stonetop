// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { bindAll } from "../../src/utils/bindAll.js";

const click = el => el.dispatchEvent(new Event("click", { bubbles: true, cancelable: true }));

function makeRoot(innerHTML) {
	document.body.innerHTML = `<div id="root">${innerHTML}</div>`;
	return document.getElementById("root");
}

describe("bindAll", () => {
	beforeEach(() => { document.body.innerHTML = ""; });

	it("binds the handler to every current match", () => {
		const fn = vi.fn();
		const root = makeRoot(`<button class="x"></button><button class="x"></button>`);
		bindAll(root, ".x", "click", fn);

		for (const el of root.querySelectorAll(".x")) click(el);

		expect(fn).toHaveBeenCalledTimes(2);
	});

	it("preserves jQuery-style ev.currentTarget (the bound element, not the click target)", () => {
		let seen = null;
		const root = makeRoot(`<button class="x" data-slug="bo"><i class="inner"></i></button>`);
		bindAll(root, ".x", "click", ev => { seen = ev.currentTarget; });

		click(root.querySelector(".inner")); // click the child; handler is on the button

		expect(seen).toBe(root.querySelector(".x"));
		expect(seen.dataset.slug).toBe("bo");
	});

	it("is a no-op when nothing matches", () => {
		const root = makeRoot(`<button class="y"></button>`);
		expect(() => bindAll(root, ".x", "click", vi.fn())).not.toThrow();
	});
});
