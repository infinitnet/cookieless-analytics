/**
 * Setup prompts of the empty states: a view that reads a user definition (a goal, a funnel, a segment) and finds none
 * says what the thing is and links to the Definitions tab that creates it. `tests/admin-setup.test.tsx` checks the copy.
 */
import { LinkButton } from "@cloudflare/kumo";
import { useEffect, useState } from "react";
import { definitionCount } from "./api.js";
import { adminHref } from "./components/ReportNotices.js";
import { wikiUrl } from "./docs-links.js";

/** The definitions an empty view can ask for: listed through `config/<kind>/list`. */
export type DefinitionKind = "goals" | "funnels" | "segments";

export interface SetupCopy {
	title: string;
	text: string;
	label: string;
	href: string;
}

/** `?tab=<kind>&new=1` opens the Definitions tab with its New form open. */
const create = (kind: DefinitionKind) => adminHref(`/config?tab=${kind}&new=1`);
const open = (kind: DefinitionKind) => adminHref(`/config?tab=${kind}`);

export const SETUP_COPY = {
	goals: { title: "No goals yet.", text: "A goal counts the sessions that reach a page, send an event or click an outbound link.", label: "Create a goal", href: create("goals") },
	funnels: { title: "No funnels yet.", text: "A funnel is 2 to 6 steps in order; it shows how many sessions reached each step and where they left.", label: "Create a funnel", href: create("funnels") },
	segments: { title: "No segments yet.", text: "A segment is a saved set of filters to apply to any report.", label: "Create a segment", href: create("segments") },
	"goal-removed": { title: "Definition removed.", text: "The goal this tile reads was deleted.", label: "Open Goals", href: open("goals") },
	"funnel-removed": { title: "Definition removed.", text: "The funnel this tile reads was deleted.", label: "Open Funnels", href: open("funnels") },
	"segment-removed": { title: "Definition removed.", text: "The default segment of this dashboard was deleted; the tiles show all visitors.", label: "Open Segments", href: open("segments") },
	search: { title: "No Search source is connected.", text: "Clicks, impressions and positions come from Google Search Console or Bing Webmaster Tools.", label: "Connect Search", href: adminHref("/search") },
	move: { title: "Nothing to move.", text: "This site writes to the EmDash database; to move its data, point the plugin options at a new database and deploy first.", label: "How to move data", href: wikiUrl("Move-Data") },
	links: { title: "No short link activity yet.", text: "Short links show here once a link rule or redirect records a click or an impression.", label: "How short links work", href: wikiUrl("Links-Report") },
} as const satisfies Record<string, SetupCopy>;
export type SetupKind = keyof typeof SETUP_COPY;

/**
 * How many `kind` definitions the site has: null while loading, when `on` is false (a remote site keeps its
 * definitions on its own install) and when the list is refused (a user without `plugins:manage`), so no setup
 * button shows then. `site` only re-runs the count when the site changes.
 */
export function useDefinitionCount(kind: DefinitionKind, site: string, on = true): number | null {
	const [n, setN] = useState<number | null>(null);
	useEffect(() => {
		setN(null);
		if (!on) return;
		let live = true;
		void definitionCount(kind).then((v) => live && setN(v));
		return () => {
			live = false;
		};
	}, [kind, site, on]);
	return n;
}

/**
 * Empty state of a view whose definition is missing or removed: what it is in one sentence and one primary button,
 * a real link into Definitions (keyboard, middle click and copy link work). Shared dashboards are plain HTML and
 * never render it.
 */
export function SetupEmpty({ kind }: { kind: SetupKind }) {
	const c: SetupCopy = SETUP_COPY[kind];
	return (
		<div className="ca-empty" data-setup={kind}>
			<p className="ca-empty-title">{c.title}</p>
			<p className="ca-small">{c.text}</p>
			<LinkButton size="sm" variant="primary" href={c.href}>
				{c.label}
			</LinkButton>
		</div>
	);
}
