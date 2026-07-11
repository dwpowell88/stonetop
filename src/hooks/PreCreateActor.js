const NPC_DEFAULT_IMG = "systems/stonetop/assets/content/icons/npc.png";
const FOUNDRY_DEFAULT_IMG = "icons/svg/mystery-man.svg";

// Give new NPCs (the type used for standalone NPCs and followers) our house icon instead of
// Foundry's generic mystery-man. Only applies when no specific image was provided (e.g. a blank
// NPC from the sidebar) so dropping a compendium follower keeps its own icon (crew, companion, …).
export function onPreCreateActor(document, data) {
	if (document.type !== "npc") return;
	if (data.img && data.img !== FOUNDRY_DEFAULT_IMG) return;
	document.updateSource({ img: NPC_DEFAULT_IMG, "prototypeToken.texture.src": NPC_DEFAULT_IMG });
}
