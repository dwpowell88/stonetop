// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { bindConfirmedDeletes } from "../../src/utils/bindConfirmedDeletes.js";
import { confirmDelete } from "../../src/utils/confirmDelete.js";

vi.mock("../../src/utils/confirmDelete.js", () => ({ confirmDelete: vi.fn() }));

const fire = (el, type) => el.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }));

function makeRoot() {
	document.body.innerHTML = `<div id="root"><button class="del" data-name="Cloak"></button></div>`;
	return document.getElementById("root");
}

// The handlers are async; flush the microtask queue before asserting.
const settle = () => new Promise(r => setTimeout(r));

describe("bindConfirmedDeletes", () => {
	beforeEach(() => {
		document.body.innerHTML = "";
		confirmDelete.mockReset();
	});

	it("left-click runs the action only after the confirm resolves true", async () => {
		confirmDelete.mockResolvedValue(true);
		const run = vi.fn();
		const root = makeRoot();
		bindConfirmedDeletes(root, ".del", run);

		fire(root.querySelector(".del"), "click");
		await settle();

		expect(confirmDelete).toHaveBeenCalledWith("Cloak"); // shows the row's data-name
		expect(run).toHaveBeenCalledTimes(1);
	});

	it("left-click does nothing when the confirm is declined", async () => {
		confirmDelete.mockResolvedValue(false);
		const run = vi.fn();
		const root = makeRoot();
		bindConfirmedDeletes(root, ".del", run);

		fire(root.querySelector(".del"), "click");
		await settle();

		expect(run).not.toHaveBeenCalled();
	});

	it("right-click skips the confirmation entirely", async () => {
		const run = vi.fn();
		const root = makeRoot();
		bindConfirmedDeletes(root, ".del", run);

		fire(root.querySelector(".del"), "contextmenu");
		await settle();

		expect(confirmDelete).not.toHaveBeenCalled();
		expect(run).toHaveBeenCalledTimes(1);
	});
});
