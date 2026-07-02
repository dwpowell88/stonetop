import { describe, it, expect } from "vitest";
import { parseTrack, stripMarkers, stripLoyalty, parseItemLine, unlockSlug, followerChoiceEntry, isArcanaFollower, titleCase, majorMoveName, parseRequires, detectUnlockAt, parseFront, parseBack } from "../../../scripts/import/pdf/arcana-parse.js";

// Synthetic block factories (markers are literal glyphs in the line text, as the load pipeline injects).
const _line = (text) => ({ text, bbox: [0, 0, 0, 0], spans: [{ font: "ACaslonPro-Regular", size: 9, text }] });
const _para = (...t) => ({ type: "para", lines: t.map(_line) });
const _list = (...items) => ({ type: "list", items: items.map((it) => it.map(_line)) });
const _heading = (t) => ({ type: "heading", line: _line(t) });
const _rule = () => ({ type: "rule" });

describe("parseTrack", () => {
	it("counts a single leading box as a max-1 track and strips it", () => {
		expect(parseTrack("□ … you must restore the runes")).toEqual({ max: 1, text: "… you must restore the runes" });
	});
	it("counts leading + trailing boxes around an entry (embedded track)", () => {
		expect(parseTrack("◻◻◻ You lose yourself in a blood-rage. ◻")).toEqual({ max: 4, text: "You lose yourself in a blood-rage." });
	});
	it("treats a pure circle run (text-layer 'l' glyphs) as a track with empty text", () => {
		expect(parseTrack("l l l l l")).toEqual({ max: 5, text: "" });
	});
	it("treats a pure ○ run as a track with empty text", () => {
		expect(parseTrack("○ ○ ○")).toEqual({ max: 3, text: "" });
	});
	it("never miscounts 'l's inside real words", () => {
		expect(parseTrack("I will call the spirits")).toEqual({ max: 0, text: "I will call the spirits" });
	});
});

describe("stripMarkers", () => {
	it("removes box/circle/diamond glyphs from markdown text, keeping emphasis", () => {
		expect(stripMarkers("◻◻ **You** lose yourself ◻")).toBe("**You** lose yourself");
	});
});

describe("stripLoyalty", () => {
	it("strips a trailing (Loyalty ◯◯◯) from a cost line (loyalty is always 3)", () => {
		expect(stripLoyalty("wonder, excitement, joy, discovery (Loyalty ◯◯◯)")).toBe("wonder, excitement, joy, discovery");
	});
	it("handles ○ glyphs / spaces and leaves a cost with no loyalty untouched", () => {
		expect(stripLoyalty("to be useful (Loyalty ○ ○)")).toBe("to be useful");
		expect(stripLoyalty("wonder and joy")).toBe("wonder and joy");
	});
	it("handles real book noise: trailing stray markers, a 'Loyalty:' colon, and a loyalty-only cost", () => {
		expect(stripLoyalty("souls feasted upon (Loyalty  ○ ○  ) ○")).toBe("souls feasted upon");
		expect(stripLoyalty("profuse gratitude (Loyalty:  ○ ○ ○ )")).toBe("profuse gratitude");
		expect(stripLoyalty("Loyalty ◯◯◯")).toBe("");
	});
});

describe("titleCase (major mystery-move names)", () => {
	it("title-cases an all-caps move name, lowercasing minor words (not the first)", () => {
		expect(titleCase("UNQUENCHED")).toBe("Unquenched");
		expect(titleCase("A FLICKERING FLAME")).toBe("A Flickering Flame");
		expect(titleCase("SPIRITS OF THE HERD")).toBe("Spirits of the Herd");
		expect(titleCase("PROMISE OF DOOM")).toBe("Promise of Doom");
	});
});

describe("majorMoveName", () => {
	it("splits a leading all-caps run (the move name) from any inline remainder", () => {
		expect(majorMoveName("UNQUENCHED")).toEqual({ name: "UNQUENCHED", rest: "" });
		expect(majorMoveName("A FLICKERING FLAME")).toEqual({ name: "A FLICKERING FLAME", rest: "" });
		expect(majorMoveName("WHISPERS When you grip the shaft")).toEqual({ name: "WHISPERS", rest: "When you grip the shaft" });
	});
	it("returns null name when the line is not an all-caps move header", () => {
		expect(majorMoveName("When you do the thing").name).toBe("");
	});
});

describe("detectUnlockAt (front 'marked N / last mark … unlock' phrase)", () => {
	const line = (text) => ({ text, bbox: [0, 0, 0, 0], spans: [{ font: "ACaslonPro-Regular", size: 9, text }] });
	const para = (...t) => ({ type: "para", lines: t.map(line) });
	const list = (...items) => ({ type: "list", items: items.map((it) => it.map(line)) });
	it("reads an explicit 'marked N' count", () => {
		expect(detectUnlockAt([para("When you have marked 3 tasks, you unlock the mysteries.")])).toBe(3);
	});
	it("uses the standalone Marks-run length for 'the last mark'", () => {
		expect(detectUnlockAt([para("mark 1:"), list(["l l l l l"]), para("When you make the last mark, you unlock the shield’s mysteries.")])).toBe(5);
	});
	it("is null when there is no unlock phrase", () => {
		expect(detectUnlockAt([para("When you draw the sword, it leaps forth.")])).toBeNull();
	});
});

describe("parseBack — major mysteries (moves + consequence tracks)", () => {
	const back = parseBack([
		_heading("Mysteries of the Test Blade"),
		_heading("Moves"),
		_list(["□ UNQUENCHED", "When you **Clash**, mark a consequence."]),
		_para("When you have marked 3 consequences, you gain A Flickering Flame."),
		_rule(),
		_list(["□ A FLICKERING FLAME", "Roll +CON: hold Speed; spend Speed to:"], ["ä Attack any number of foes"], ["ä Strike a weak point"]),
		_heading("Consequences"),
		_list(["□ □ You lose yourself in a blood-rage. □"]),
		_para("When you attack, advantage on damage."),
		_list(["□ Pick someone who survives."]),
	], { slug: "test-blade", name: "Test Blade", major: true, unlockAt: 3 });

	it("sets the major back scaffolding (itemSameAsFront, no item, unlockAt)", () => {
		expect(back.title).toBe("Mysteries of the Test Blade");
		expect(back.itemSameAsFront).toBe(true);
		expect(back.item).toBeNull();
		expect(back.unlockAt).toBe(3);
	});
	it("parses □ ALL-CAPS moves (title-cased + id) and folds sub-bullets instead of splitting them", () => {
		expect(back.moves.map((m) => m.name)).toEqual(["Unquenched", "A Flickering Flame"]);
		expect(back.moves[0]).toEqual({ id: "unquenched", name: "Unquenched", text: "When you **Clash**, mark a consequence.\n\nWhen you have marked 3 consequences, you gain A Flickering Flame." });
		expect(back.moves[1].text).toContain("- Attack any number of foes");
		expect(back.moves[1].text).toContain("- Strike a weak point");
	});
	it("extracts each consequence's □ run into track:{max} and slugs them <abbr>-cN", () => {
		expect(back.consequences.slug).toBe("consequences");
		expect(back.consequences.list.map((r) => r.slug)).toEqual(["blade-c1", "blade-c2"]);
		expect(back.consequences.list[0].track).toEqual({ max: 3 });
		expect(back.consequences.list[0].content.text).toBe("You lose yourself in a blood-rage.\n\nWhen you attack, advantage on damage.");
		expect(back.consequences.list[1].track).toEqual({ max: 1 });
	});
	it("derives the 'Mysteries of the X' title when the back has no title heading", () => {
		const b = parseBack([
			_heading("Moves"),
			_list(["□ POWER When you bear the staff, choose one:"]),
			_heading("Consequences"),
			_list(["□ One of your eyes becomes strange."]),
		], { slug: "staff-of-the-lidless-orb", name: "Staff of the Lidless Orb", major: true, unlockAt: 3 });
		expect(b.title).toBe("Mysteries of the Staff of the Lidless Orb");
		expect(b.moves.map((m) => m.name)).toEqual(["Power"]);
	});
	it("folds '□ Word.' options (rule-separated, not ALL-CAPS) into the preceding move", () => {
		const b = parseBack([
			_heading("Moves"),
			_list(["□ SPEAK THE UNUTTERABLE When you speak a Word, roll +CON."]),
			_rule(),
			_para("MASTERED WORDS"),
			_rule(),
			_list(["□ Seal. Name a portal; it seals shut."]),
			_rule(),
			_list(["□ Purify. Name a corruption; it is cleansed."]),
		], { slug: "ineffable-words", name: "Ineffable Words", major: true });
		expect(b.moves).toHaveLength(1);
		expect(b.moves[0].name).toBe("Speak the Unutterable");
		expect(b.moves[0].text).toContain("- Seal. Name a portal");
		expect(b.moves[0].text).toContain("- Purify. Name a corruption");
	});
	it("starts a new consequence when a box follows stray leading circles, counting only boxes for the track", () => {
		const b = parseBack([
			_heading("Consequences"),
			_list(["□ First consequence."], ["○ ○ □ Your body withers—mark the weakened debility."]),
		], { slug: "norubas-ice-sphere", name: "Noruba's Ice Sphere", major: true });
		expect(b.consequences.list).toHaveLength(2);
		expect(b.consequences.list[1].content.text).toBe("Your body withers—mark the weakened debility.");
		expect(b.consequences.list[1].track).toEqual({ max: 1 });
	});
	it("extracts a move's leading (Requires: …) into requirement and strips it from the move text", () => {
		const b = parseBack([
			_heading("Moves"),
			_list(["□ RESONANCE (Requires: Battery, Eye of the Storm) When you unleash the storm, roll +CON."]),
		], { slug: "azure-hand", name: "Azure Hand", major: true });
		expect(b.moves[0].name).toBe("Resonance");
		expect(b.moves[0].requirement).toEqual({ moves: ["Battery", "Eye of the Storm"] });
		expect(b.moves[0].text).toBe("When you unleash the storm, roll +CON.");
	});
});

describe("parseRequires", () => {
	it("pulls a leading (Requires: A, B) into requirement moves and strips it from the text", () => {
		expect(parseRequires("(Requires: Battery, Eye of the Storm) When you unleash the storm."))
			.toEqual({ moves: ["Battery", "Eye of the Storm"], text: "When you unleash the storm." });
	});
	it("returns null moves and the unchanged text when there is no requires prefix", () => {
		expect(parseRequires("When you grip the shaft, roll +CON.")).toEqual({ moves: null, text: "When you grip the shaft, roll +CON." });
	});
});

describe("parseFront — major unlock (Marks track + trigger + trailing trim)", () => {
	const front = parseFront([
		_heading("Azure Hand"),
		_para("◇ , close, magical"),
		_para("A thick staff of gray metal."),
		_rule(),
		_para("When you **_bear the Azure Hand_**, you sense energy."),
		_list(["l l l l"]),
		_para("When you make the last mark, you unlock the mysteries."),
	], { name: "Azure Hand", slug: "azure-hand" });

	it("keeps the standalone Marks run as one track entry with its true max", () => {
		const marks = front.unlock.list.find((e) => e.slug === "marks");
		expect(marks.track).toEqual({ max: 4 });
		expect(marks.content.text).toBe("Marks");
	});
	it("drops the trailing 'last mark … unlock' instruction and keeps the trigger in unlock", () => {
		expect(front.unlock.list.at(-1).slug).toBe("marks");
		expect(front.unlock.list[0].content.text).toContain("bear the Azure Hand");
		expect(front.description).toContain("thick staff");
	});
	it("counts inline ◇ pips on the item line so a 2-pip item weighs 2", () => {
		const f = parseFront([
			_heading("Rune-laden Scales"),
			_list(["◇ ◇ , 2 armor, *magical*"]),
			_para("An ancient vest of bluish steel."),
		], { name: "Rune-laden Scales", slug: "rune-laden-scales" });
		expect(f.item).toMatchObject({ name: "Rune-laden Scales", weight: 2, tags: "magical", note: "2 armor" });
	});
	it("folds a trigger's option bullets into that trigger entry (not separate rows)", () => {
		const f = parseFront([
			_heading("Azure Hand"),
			_para("When you **_brandish the Hand_**, choose 1:"),
			_list(["ä Direct the energy"], ["ä Discharge the energy"]),
			_para("On a 6-, mark 1:"),
			_list(["l l l l"]),
		], { name: "Azure Hand", slug: "azure-hand" });
		expect(f.unlock.list).toHaveLength(2); // the brandish trigger (+bullets+6-) and the Marks track
		expect(f.unlock.list[0].content.text).toBe("When you **_brandish the Hand_**, choose 1:\n- Direct the energy\n- Discharge the energy\n\nOn a 6-, mark 1:");
		expect(f.unlock.list[1].track).toEqual({ max: 4 });
	});
});

describe("followerChoiceEntry", () => {
	it("builds the single-pick choice row that links an arcanum back to its follower", () => {
		expect(followerChoiceEntry("tulpa")).toEqual({
			type: "entry", slug: "tulpa", content: { title: null, text: "" },
			track: { max: 1 }, inlineDisplay: true, followers: ["tulpa"],
		});
	});
});

describe("isArcanaFollower", () => {
	const block = (icon, name = "Tulpa") => ({ icon, lines: [{ text: name, font: "Avara-Bold", size: 9, spans: [], bbox: [0, 0, 0, 0] }] });
	it("accepts a real follower stat block (small creature marker icon)", () => {
		expect(isArcanaFollower(block({ w: 18 }))).toBe(true);
	});
	it("rejects the card-border decoration (~42px) and an icon-less fragment", () => {
		expect(isArcanaFollower(block({ w: 42 }))).toBe(false);
		expect(isArcanaFollower(block(null))).toBe(false);
	});
	it("rejects a numeric/heading name even with a small icon", () => {
		expect(isArcanaFollower(block({ w: 18 }, "13"))).toBe(false);
	});
});

describe("parseItemLine", () => {
	it("splits italic *tags* from a plain note (book italicizes tags, leaves stats plain)", () => {
		expect(parseItemLine(", *close*, +1 damage, 1 piercing, *messy*, *magical*", { name: "Blood-quenched Sword", pips: 1 }))
			.toEqual({ name: "Blood-quenched Sword", weight: 1, tags: "close, messy, magical", note: "+1 damage, 1 piercing", inventoryColumn: "regular" });
	});
	it("collects a leading-comma italic run and multi-tag runs into tags (null note when all italic)", () => {
		expect(parseItemLine("*, close*, *magical*, *awkward*", { name: "Azure Hand", pips: 1 }))
			.toEqual({ name: "Azure Hand", weight: 1, tags: "close, magical, awkward", note: null, inventoryColumn: "regular" });
		expect(parseItemLine(", *beautiful, fragile*", { name: "Scroll", pips: 1 }))
			.toMatchObject({ tags: "beautiful, fragile", note: null });
	});
	it("uses ◇ pip count for weight and strips leading ◇", () => {
		expect(parseItemLine("◇◇ , *awkward*", { name: "Mindgem", pips: 2 }).weight).toBe(2);
	});
	it("returns null when there is no tags text, no note, and no pips", () => {
		expect(parseItemLine("", { name: "X", pips: 0 })).toBeNull();
	});
});

describe("unlockSlug", () => {
	it("is a deterministic kebab of the option's salient words", () => {
		const s = unlockSlug("… imbibe a prodigious, dangerous quantity of alcohol.");
		expect(s).toMatch(/^[a-z0-9-]+$/);
		expect(unlockSlug("… imbibe a prodigious, dangerous quantity of alcohol.")).toBe(s); // stable
	});
});
