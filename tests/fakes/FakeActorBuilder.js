import {FakeActorScaffold} from "./FakeActorScaffold.js";

// A domain-free fake actor for unit tests of generic, section-parameterised classes — the steading
// PersonList / Residents / NeighborPeople / SteadingImprovements helpers and the steading migration —
// which just need "some actor with system/items/flags/update", not character behaviour. Unlike
// FakeCharacterActorBuilder it wires NO DataModel, so writes to any `system.*` section are kept (these
// classes store on arbitrary sections that a character schema would rightly strip). Character sheet
// tests should use FakeCharacterActorBuilder so their writes ARE schema-checked.
export class FakeActorBuilder {
	_scaffold = new FakeActorScaffold("Test Actor");
	_type   = "actor";
	_system = {};

	withName(name)   { this._scaffold.setName(name); return this; }
	withType(type)   { this._type = type; return this; }
	withSystem(sys)  { this._system = sys; return this; }
	withItems(items) { this._scaffold.setItems(items); return this; }
	addItem(item)    { this._scaffold.addItem(item); return this; }
	withFlag(key, value) { this._scaffold.flagsBuilder.withFlag(key, value); return this; }
	withFlags(flags)     { this._scaffold.flagsBuilder.withFlags(flags); return this; }

	build() { return this._scaffold.build(this._type, this._system); }
}
