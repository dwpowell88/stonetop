import { FollowerSnapshotBuilder } from "../../model/snapshot/character/FollowerSnapshot.js";
import { StonetopFlags } from "../../actors/character/StonetopFlags.js";

export class StonetopNpc {
    constructor(actor) {
        this._flags = new StonetopFlags(actor, "npc");
    }

    static create(actor) {
        return new StonetopNpc(actor);
    }

    get hp() {
		return this._flags.getFlag("hp") ?? 0;
	}

	async setHp(value) {
		await this._flags.setFlag("hp", value);
	}

	get maxHp() {
		return this._flags.getFlag("maxHp") ?? 0;
	}

	async setMaxHp(value) {
		await this._flags.setFlag("maxHp", value);
	}

    get armor() {
		return this._flags.getFlag("armor") ?? 0;
	}

	async setArmor(value) {
		await this._flags.setFlag("armor", value);
	}

    get damage() {
		return this._flags.getFlag("damage") ?? "d6";
	}

	async setDamage(value) {
		await this._flags.setFlag("damage", value);
	}

    get specialQuality() {
		return this._flags.getFlag("specialQuality") ?? "";
	}

	async setSpecialQuality(value) {
		await this._flags.setFlag("specialQuality", value);
	}

    get instinct() {
		return this._flags.getFlag("instinct") ?? "";
	}

	async setInstinct(value) {
		await this._flags.setFlag("instinct", value);
	}

    get description() {
		return this._flags.getFlag("description") ?? "";
	}

	async setDescription(value) {
		await this._flags.setFlag("description", value);
	}

	async buildSnapshot() {
			return new FollowerSnapshotBuilder()
				.withHp(this.hp)
				.withHpMax(this.maxHp)
				.withArmor(this.armor)
				.withDamage(this.damage)
				.withInstinct(this.instinct)
				.withSpecialQuality(this.specialQuality)
				.withDescription(this.description)
				.build();
		}
}
