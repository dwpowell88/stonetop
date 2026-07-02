import {FakeActor} from "./foundry/FakeActor.js";
import {StonetopFakeFlagsBuilder} from "./StonetopFakeFlagsBuilder.js";

// The domain-free plumbing every fake actor shares: its name, embedded items (+ the `.get` lookup
// Foundry's collection exposes), the flags builder, optional typed-actor wiring, and the handoff to
// FakeActor. The concrete actor builders (character, npc) COMPOSE one of these (hold it, not extend
// it) and add only their own system shape — see [[no-direct-mutation-after-builder]]. Each builder
// delegates its name/items/typedActor setters here and calls `build(type, system)` from its build().
export class FakeActorScaffold {
	constructor(name) {
		this.name               = name;
		this.items              = [];
		this.flagsBuilder       = new StonetopFakeFlagsBuilder();
		this.typedActorFactory  = null;
	}

	setName(name)        { this.name = name; }
	addItem(item)        { this.items.push(item); }
	setItems(items)      { this.items = items; }
	setTypedActor(factory) { this.typedActorFactory = factory; }

	build(type, system) {
		return new FakeActor({
			_name:              this.name,
			_type:              type,
			_typedActorFactory: this.typedActorFactory,
			buildSystem: () => system,
			buildItems:  () => this._buildItems(),
			buildFlags:  () => this.flagsBuilder.build(),
		});
	}

	_buildItems() {
		const items = this.items;
		items.get = id => items.find(i => i._id === id) ?? null;
		return items;
	}
}
