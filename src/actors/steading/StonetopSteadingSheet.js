import { enrichRichTextTree } from "../../utils/enrichRichText.js";
import { bindAll } from "../../utils/bindAll.js";
import { bindConfirmedDeletes } from "../../utils/bindConfirmedDeletes.js";
import { applySteadfast, loadSteadfast, loadAllSteadfasts, matchSteadfastByName } from "./applySteadfast.js";

// The steading sheet's six tabs, in nav order. `overview` is the initial tab.
const STEADING_TABS = ["overview", "residents", "neighbors", "improvements", "moves", "notes"];

export function createStonetopSteadingSheetClass(Base) {
	return class StonetopSteadingSheet extends Base {
		constructor(...args) {
			super(...args);
			this._stonetopSteading = this.actor.typedActor;
			// ApplicationV2 seeds tabGroups from static TABS, but guard the default so a fresh
			// instance (and the test fakes) always resolve to a real tab.
			this.tabGroups.primary ??= "overview";
		}

		static DEFAULT_OPTIONS = {
			// The base supplies `stonetop sheet actor themed theme-light`; add the steading class.
			classes: ["steading"],
			position: { width: 1180, height: 760 },
		};

		static PARTS = {
			form: {
				// No `scrollable`: like the NPC card, scrolling lives on .window-content (which
				// persists across V2 re-renders), not on the part content that gets replaced.
				template: "systems/stonetop/templates/actor/steading.hbs",
			},
		};

		// First tabbed actor sheet on V2. static TABS seeds tabGroups + configures changeTab; the
		// active-state records the template reads are built in _prepareContext (_getTabs).
		static TABS = {
			primary: {
				tabs: STEADING_TABS.map(id => ({ id })),
				initial: "overview",
			},
		};

		_getTabs() {
			const active = this.tabGroups.primary ?? "overview";
			const tabs = {};
			for (const id of STEADING_TABS) {
				tabs[id] = { id, group: "primary", active: id === active, cssClass: id === active ? "active" : "" };
			}
			return tabs;
		}

		async _prepareContext(options) {
			const ctx = await super._prepareContext(options);
			ctx.actor    = this.actor;
			ctx.editable = this.isEditable;
			ctx.stonetop = await this._stonetopSteading.buildSnapshot();
			await enrichRichTextTree(ctx.stonetop, this.actor?.getRollData?.() ?? {});
			// The steadfast picker at the top of the sheet: every steadfast + the one this steading uses.
			// The list is stashed so the name combobox's change handler can resolve a picked/typed name.
			ctx.availableSteadfasts = this._availableSteadfasts = await loadAllSteadfasts();
			ctx.currentSteadfast    = this.actor.system.steadfast;
			ctx.tabs = this._getTabs();
			return ctx;
		}

		// Root-delegated, one-time wiring. The V2 root persists across re-renders, so these bind
		// once; the base's _onFirstRender already wired edit toggles, comboboxes, and rollables.
		async _onFirstRender(context, options) {
			await super._onFirstRender(context, options);
			const root = this.element;

			// Tab navigation: changeTab toggles the active nav item + .tab body and records the
			// choice in tabGroups (so _getTabs restores it on the next re-render).
			root.addEventListener("click", ev => {
				const nav = ev.target.closest(".sheet-tabs [data-tab]");
				if (nav) this.changeTab(nav.dataset.tab, "primary");
			});

			// A steadfast dropped on the steading re-seeds its definition (same as picking one from
			// the dropdown); any other item embeds normally. V2 sheets have no built-in DragDrop.
			root.addEventListener("dragover", ev => ev.preventDefault());
			root.addEventListener("drop", ev => this._onDrop(ev));

			if (!this.isEditable) return;

			// Improvements — the tracks are checkbox groups; capture so the group's own toggle logic
			// doesn't swallow the change first.
			root.addEventListener("change", async ev => {
				const el = ev.target.closest(".stonetop-cg-track");
				if (!el || el.dataset.cgContext !== "improvement") return;
				const { cgGroup, cgOption, cgIndex } = el.dataset;
				const count = el.checked ? parseInt(cgIndex) + 1 : parseInt(cgIndex);
				await this._stonetopSteading.improvements.setTrack(cgGroup, cgOption, count);
			}, true);

			// Homefront move resource pips (click) + free-text resource (change). Roll clicks
			// (.rollable) are handled by the base's delegated rollable listener.
			root.addEventListener("click", async ev => {
				const btn = ev.target.closest(".stonetop-item-resource-check");
				if (!btn || btn.dataset.moveSlug === undefined) return;
				ev.stopPropagation();
				ev.stopImmediatePropagation();
				const isChecked = btn.classList.contains("is-checked");
				const current = isChecked ? Number(btn.dataset.index) : Number(btn.dataset.index) + 1;
				await this._stonetopSteading.moves.setMoveResourceCurrent(btn.dataset.moveSlug, current);
			}, true);
			root.addEventListener("change", async ev => {
				const el = ev.target.closest(".stonetop-resource-input");
				if (!el || el.dataset.moveSlug === undefined) return;
				await this._stonetopSteading.moves.setMoveResourceText(el.dataset.moveSlug, el.value);
			}, true);
		}

		// A steadfast dropped on a steading isn't embedded as an owned item — it re-seeds the
		// steading's definition. Anything else embeds as a normal owned item.
		async _onDrop(event) {
			const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
			if (data?.type !== "Item") return;
			const item = await Item.implementation.fromDropData(data);
			if (!item || !this.isEditable) return;
			if (item.type === "steadfast") {
				await applySteadfast(this.actor, item);
				return;
			}
			await this.actor.createEmbeddedDocuments("Item", [item.toObject()]);
		}

		// Direct bindings to the current controls — re-run per render (part content is replaced).
		_onRender(context, options) {
			super._onRender(context, options);
			if (!this.isEditable) return;
			const root = this.element;
			const s    = this._stonetopSteading;

			// Name combobox — typing/picking a value that matches a steadfast name applies it (re-seeds
			// the definition fields and adopts its name; runtime state like residents/debilities is
			// preserved). Any other value is just the steading's own name. Dropping a steadfast routes
			// through the same applySteadfast (see _onDrop).
			bindAll(root, ".steading-steadfast-input", "change", async ev => {
				const value = ev.currentTarget.value.trim();
				const match = matchSteadfastByName(value, this._availableSteadfasts ?? []);
				if (match) {
					const steadfast = await loadSteadfast(match.slug);
					if (steadfast) await applySteadfast(this.actor, steadfast);
				} else if (value && value !== this.actor.name) {
					await this.actor.update({ name: value });
				}
			});

			// Roll mode
			bindAll(root, "[name=stonetop-roll-mode]", "change", ev => s.setRollMode(ev.currentTarget.value));

			// Fortunes / Surplus
			bindAll(root, ".steading-box-input[name='stonetop-fortunes']", "change", async ev => {
				await s.setFortunes(parseInt(ev.currentTarget.value));
			});
			bindAll(root, ".steading-surplus-input", "change", async ev => {
				await s.setSurplus(parseInt(ev.currentTarget.value) || 0);
			});

			// Attributes (size, population, prosperity, defenses). Ratings store an actual number; size
			// stores its tier string.
			bindAll(root, ".steading-box-input[data-attr]", "change", async ev => {
				const { attr } = ev.currentTarget.dataset;
				const raw = ev.currentTarget.value;
				await s.attributes.setValue(attr, attr === "size" ? raw : parseInt(raw));
			});
			bindAll(root, ".stonetop-attr-extra-add", "click", async ev => {
				await s.attributes.addNewItemToAttribute(ev.currentTarget.dataset.attr);
			});
			bindConfirmedDeletes(root, ".stonetop-attr-extra-remove", async ev => {
				const { attr, index } = ev.currentTarget.dataset;
				await s.attributes.removeItemFromAttribute(attr, index);
			});
			bindAll(root, ".stonetop-attr-extra", "change", async ev => {
				const { attr, index } = ev.currentTarget.dataset;
				await s.attributes.updateItemOnAttribute(attr, index, ev.currentTarget.value);
			});

			// Debilities
			bindAll(root, ".steading-circle-input", "change", async ev => {
				await s.debilities.setDebility(ev.currentTarget.dataset.slug, ev.currentTarget.checked);
			});

			// Notes
			bindAll(root, ".stonetop-notes", "change", async ev => s.setNotes(ev.currentTarget.value));

			// Content (free-text textarea per category)
			bindAll(root, ".stonetop-content-textarea", "change", async ev => {
				await s.content.updateText(ev.currentTarget.dataset.type, ev.currentTarget.value);
			});

			// Asset items
			bindAll(root, ".stonetop-asset-item-add", "click", async () => { await s.assets.addItem(); });
			bindConfirmedDeletes(root, ".stonetop-asset-item-remove", async ev => {
				await s.assets.removeItem(parseInt(ev.currentTarget.dataset.index));
			});
			bindAll(root, ".stonetop-asset-item", "change", async ev => {
				await s.assets.updateItem(parseInt(ev.currentTarget.dataset.index), ev.currentTarget.value);
			});

			// Coinage
			bindAll(root, ".stonetop-coinage-purses", "change", async ev => {
				await s.assets.updatePurses(ev.currentTarget.dataset.title, parseInt(ev.currentTarget.value) || 0);
			});
			bindAll(root, ".stonetop-coinage-handfuls", "change", async ev => {
				await s.assets.updateHandfuls(ev.currentTarget.dataset.title, parseInt(ev.currentTarget.value) || 0);
			});
			bindAll(root, ".stonetop-coinage-coins", "change", async ev => {
				await s.assets.updateCoins(ev.currentTarget.dataset.title, parseInt(ev.currentTarget.value) || 0);
			});

			// Residents
			bindAll(root, ".stonetop-resident-add", "click", async () => { await s.residents.add(); });
			bindConfirmedDeletes(root, ".stonetop-resident-remove", async ev => {
				await s.residents.remove(ev.currentTarget.dataset.id);
			});
			bindAll(root, ".stonetop-resident-name", "change", async ev => {
				await s.residents.updateName(ev.currentTarget.dataset.id, ev.currentTarget.value);
			});
			bindAll(root, ".stonetop-resident-occupation", "change", async ev => {
				await s.residents.updateOccupation(ev.currentTarget.dataset.id, ev.currentTarget.value);
			});
			bindAll(root, ".stonetop-resident-traits", "change", async ev => {
				await s.residents.updateTraits(ev.currentTarget.dataset.id, ev.currentTarget.value);
			});

			// NPC traits source textarea
			bindAll(root, ".steading-npc-traits-source", "change", async ev => {
				const traits = ev.currentTarget.value.split("\n").map(t => t.trim()).filter(Boolean);
				await this.actor.update({ "system.residents.traits": traits });
			});

			// Neighbors — people
			bindAll(root, ".stonetop-neighbor-person-add", "click", async () => { await s.neighborPeople.add(); });
			bindConfirmedDeletes(root, ".stonetop-neighbor-person-remove", async ev => {
				await s.neighborPeople.remove(ev.currentTarget.dataset.id);
			});
			bindAll(root, ".stonetop-neighbor-person-name", "change", async ev => {
				await s.neighborPeople.updateName(ev.currentTarget.dataset.id, ev.currentTarget.value);
			});
			bindAll(root, ".stonetop-neighbor-person-occupation", "change", async ev => {
				await s.neighborPeople.updateOccupation(ev.currentTarget.dataset.id, ev.currentTarget.value);
			});
			bindAll(root, ".stonetop-neighbor-person-traits", "change", async ev => {
				await s.neighborPeople.updateTraits(ev.currentTarget.dataset.id, ev.currentTarget.value);
			});
			bindAll(root, ".stonetop-neighbor-person-home", "change", async ev => {
				await s.neighborPeople.updateHome(ev.currentTarget.dataset.id, ev.currentTarget.value);
			});

			// Neighbors — places
			bindAll(root, ".stonetop-neighbor-place-note", "change", async ev => {
				await s.neighborPlaces.updateNote(ev.currentTarget.dataset.id, ev.currentTarget.value);
			});

			// Places of Interest
			bindAll(root, ".stonetop-place-add", "click", async () => { await s.placesOfInterest.addBlankPlace(); });
			bindAll(root, ".stonetop-place-field", "change", async ev => {
				await s.placesOfInterest.setPlaceValue(parseInt(ev.currentTarget.dataset.index), ev.currentTarget.value);
			});

			// Homefront moves: the acquisition checkbox toggles the owned move. Resource pips/text are
			// wired once (delegated) in _onFirstRender.
			bindAll(root, ".stonetop-move-check", "change", async ev => {
				const { moveSlug } = ev.currentTarget.dataset;
				if (ev.currentTarget.checked) await s.moves.incrementMove(moveSlug);
				else                          await s.moves.decrementMove(moveSlug);
			});
		}
	};
}
