/** US English in every tracked text file: code, identifiers, routes, file names, docs, wiki and tests. */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** Words to flag, with their US spelling. Families below catch the regular cases this list does not name. */
const WORDS = new Map<string, string>(
	Object.entries({
		acknowledgement: "acknowledgment",
		acknowledgements: "acknowledgments",
		ageing: "aging",
		aluminium: "aluminum",
		amongst: "among",
		analyse: "analyze",
		analysed: "analyzed",
		analysing: "analyzing",
		artefact: "artifact",
		artefacts: "artifacts",
		burnt: "burned",
		catalogue: "catalog",
		catalogues: "catalogs",
		cheque: "check",
		cheques: "checks",
		defence: "defense",
		dialogue: "dialog",
		dialogues: "dialogs",
		analogue: "analog",
		draught: "draft",
		draughts: "drafts",
		dreamt: "dreamed",
		enrol: "enroll",
		enrolment: "enrollment",
		enrols: "enrolls",
		fulfil: "fulfill",
		fulfilment: "fulfillment",
		fulfils: "fulfills",
		grey: "gray",
		greyed: "grayed",
		greying: "graying",
		greys: "grays",
		instalment: "installment",
		instalments: "installments",
		jewellery: "jewelry",
		judgement: "judgment",
		judgements: "judgments",
		kerb: "curb",
		learnt: "learned",
		licence: "license",
		licences: "licenses",
		marvellous: "marvelous",
		maths: "math",
		mould: "mold",
		moulds: "molds",
		offence: "offense",
		plough: "plow",
		practise: "practice",
		practised: "practiced",
		practises: "practices",
		practising: "practicing",
		pretence: "pretense",
		programme: "program",
		programmes: "programs",
		sceptic: "skeptic",
		sceptical: "skeptical",
		scepticism: "skepticism",
		speciality: "specialty",
		spelt: "spelled",
		tyre: "tire",
		tyres: "tires",
		whilst: "while",
		jewellers: "jewelers",
		counsellor: "counselor",
	}),
);

/** Doubled l before -ed, -ing, -er where US English keeps one l. */
const DOUBLED_L = /^(cancel|label|unlabel|model|travel|signal|fuel|level|total|channel|tunnel|funnel|dial|equal|panel|quarrel|shovel|rival|marshal|counsel|jewel|label|pedal|duel|refuel|remodel)l(ed|ing|er|ers)$/;
/** -our where US English writes -or. */
const OUR = /^(behavi|col|fav|hon|lab|harb|rum|vap|flav|neighb|hum|od|sav|endeav|arm|clam|parl|rig|splend|tum|vig|val|ard|ferv|savi)our(s|ed|ing|ite|ites|able|ful|less|ers?|ly|al|ally|hood|hoods|less)?$/;
/** -re where US English writes -er. */
const RE = /^(cent|met|lit|theat|fib|calib|sab|somb|spect|lust|meag|kilomet|centimet|millimet|manoeuv)re(s|d)?$/;
/** -ise and -isation where US English writes -ize and -ization (anything ending so, minus real -ise words). */
const ISE = /^[a-z]{2,}is(e|ed|es|ing|er|ers|ation|ations|able)$/;
const ISE_WORDS = new Set(
	(
		"advertise advertised advertises advertising advertiser advertisers advise advised advises advising adviser advisers advisable arise arises arising " +
		"chastise comprise comprised comprises comprising compromise compromised compromises compromising concise demise despise devise devised devises devising " +
		"disguise disguised enterprise enterprises excise exercise exercised exercises exercising expertise franchise improvise improvised incise merchandise " +
		"noise noises otherwise likewise clockwise anticlockwise counterclockwise precise imprecise premise premises promise promised promises promising raise raised raises raising " +
		"praise praised poise poised cruise cruised bruise paradise porpoise tortoise turquoise anise mortise valise reprise " +
		"revise revised revises revising rise rises rising risen arisen surprise surprised surprises surprising supervise supervised supervises supervising " +
		"televise treatise wise wiser stepwise bytewise pairwise elementwise rowwise piecewise disable disabled disables disabling dismissable"
	).split(" "),
);
/** -yse where US English writes -yze (the noun "analyses" stays). */
const YSE = /^(anal|paral|catal|electrol|hydrol|dial)ys(e|ed|ing|er|ers)$/;
/** Phrases (lowercase, matched on the whole line). */
const PHRASES: Array<[RegExp, string, string]> = [[/\bper cent\b/i, "per cent", "percent"]];

/** The US spelling of a flagged word, or null when the word is fine. */
export function usSpelling(word: string): string | null {
	const w = word.toLowerCase();
	const listed = WORDS.get(w);
	if (listed) return listed;
	let m = DOUBLED_L.exec(w);
	if (m) return `${m[1]}${m[2]}`;
	m = OUR.exec(w);
	if (m) return `${m[1]}or${m[2] ?? ""}`;
	m = RE.exec(w);
	if (m) return `${m[1]}er${m[2] ?? ""}`.replace(/manoeuver/, "maneuver");
	m = YSE.exec(w);
	if (m) return `${m[1]}yz${m[2]}`;
	if (ISE.test(w) && !ISE_WORDS.has(w)) return w.replace(/is(e|ed|es|ing|er|ers|ation|ations|able)$/, "iz$1");
	return null;
}

/** Links to other sites are quoted external text; links into this project are checked like any other text. */
const EXTERNAL_URL = /https?:\/\/(?![^\s)"'<>`]*infinitnet\/cookieless-analytics)(?!img\.shields\.io\/badge)[^\s)"'<>`]+/g;

export type Hit = { line: number; word: string; us: string };

/** Every UK spelling in `text`: words split at camelCase, snake_case and kebab-case, then the phrases. */
export function findUk(text: string): Hit[] {
	const hits: Hit[] = [];
	text.split("\n").forEach((raw, i) => {
		const line = raw.replace(EXTERNAL_URL, " ");
		for (const run of line.match(/[A-Za-z]+/g) ?? []) {
			for (const part of run.match(/[A-Z]?[a-z]+|[A-Z]+(?![a-z])/g) ?? []) {
				const us = usSpelling(part);
				if (us) hits.push({ line: i + 1, word: part, us });
			}
		}
		for (const [re, word, us] of PHRASES) if (re.test(line)) hits.push({ line: i + 1, word, us });
	});
	return hits;
}

/** Files that are not checked, each with the reason. */
const SKIP: Array<[RegExp, string]> = [
	[/^dist\//, "build output, regenerated from src"],
	[/(^|\/)pnpm-lock\.yaml$|(^|\/)package-lock\.json$/, "lockfiles name third-party packages"],
	[/^(template\/)?LICENSE$/, "the Apache-2.0 and MIT license texts are quoted verbatim"],
	[/^tests\/us-english\.test\.ts$/, "this test lists the UK spellings it looks for"],
];

/** Single words allowed in one file, each with the reason. Keep this short. */
const ALLOW: Array<{ file: string; word: string; reason: string }> = [];

function tracked(): string[] {
	return execFileSync("git", ["ls-files", "-z"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
		.split("\0")
		.filter((f) => f && !SKIP.some(([re]) => re.test(f)));
}

function textOf(file: string): string | null {
	let buf: Buffer;
	try {
		buf = readFileSync(file);
	} catch {
		return null;
	}
	return buf.subarray(0, 8000).includes(0) ? null : buf.toString("utf8");
}

describe("US English", () => {
	it("the matcher flags UK spellings in prose, identifiers, routes and file names", () => {
		const sample = [
			"The colour of the centre, whilst neighbourFromSummary was cancelled.",
			"export const BEHAVIOUR_CATALOG = { route: '/behaviour' }; // labelled, normalised, organisations",
			"docs/wiki/images/behaviour-goals.png greyed out, a licence, a judgement, 10 per cent",
		].join("\n");
		expect(findUk(sample).map((h) => `${h.line}:${h.word}>${h.us}`)).toEqual([
			"1:colour>color",
			"1:centre>center",
			"1:whilst>while",
			"1:neighbour>neighbor",
			"1:cancelled>canceled",
			"2:BEHAVIOUR>behavior",
			"2:behaviour>behavior",
			"2:labelled>labeled",
			"2:normalised>normalized",
			"2:organisations>organizations",
			"3:behaviour>behavior",
			"3:greyed>grayed",
			"3:licence>license",
			"3:judgement>judgment",
			"3:per cent>percent",
		]);
	});

	it("the matcher leaves US words, look-alikes, standard attributes and other sites' URLs alone", () => {
		const sample = [
			"four hours of your behavior: color, center, canceled, labeled, normalized, the analyses",
			'otherwise a promise; raise, rising, noise, advertising, exercise, stepwise <div aria-labelledby="x">',
			"cancellation, installed, filled, controller, sources, journey, towards, source, tour, detour",
			"[ICO](https://ico.org.uk/for-organisations/guidance/)",
		].join("\n");
		expect(findUk(sample)).toEqual([]);
		expect(findUk("[guide](https://github.com/infinitnet/cookieless-analytics/blob/main/docs/behaviour.md)")).toHaveLength(1);
	});

	it("no tracked text file, file name or path uses a UK spelling", () => {
		const files = tracked();
		expect(files.length).toBeGreaterThan(300);
		const bad: string[] = [];
		for (const f of files) {
			for (const h of findUk(f)) bad.push(`${f} (file name): "${h.word}" should be "${h.us}"`);
			const text = textOf(f);
			if (text === null) continue;
			for (const h of findUk(text)) {
				if (ALLOW.some((a) => a.file === f && a.word.toLowerCase() === h.word.toLowerCase())) continue;
				bad.push(`${f}:${h.line}: "${h.word}" should be "${h.us}"`);
			}
		}
		expect(bad).toEqual([]);
	});

	it("every allowlist entry is still needed and has a reason", () => {
		for (const a of ALLOW) {
			expect(a.reason.length).toBeGreaterThan(10);
			const text = textOf(a.file) ?? "";
			expect(findUk(text).some((h) => h.word.toLowerCase() === a.word.toLowerCase())).toBe(true);
		}
	});
});
