import { migrateChoicesField } from "../migration/migrateChoices.js";

export class InsertData extends foundry.abstract.TypeDataModel {
	static migrateData(source) {
		migrateChoicesField(source.choices);
		return super.migrateData(source);
	}

	static defineSchema() {
		const f = foundry.data.fields;
		return {
			slug:         new f.StringField({ nullable: true, initial: null }),
			description:  new f.StringField({ initial: "" }),
			instinct:     new f.ObjectField({ nullable: true, initial: null }),
			choices:      new f.ArrayField(new f.ObjectField()),
			// Moves referenced by slug (resolved across compendium + world); moves don't back-reference
			// the insert. `startingMoves` is the subset seeded acquired when the insert is granted
			// (built-in inserts list all of them; custom inserts choose).
			moves:         new f.ArrayField(new f.StringField()),
			startingMoves: new f.ArrayField(new f.StringField()),
			choiceValues:  new f.ObjectField(),
		};
	}
}
