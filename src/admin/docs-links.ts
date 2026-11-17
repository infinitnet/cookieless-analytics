/** In-app "Learn more" links: they open the wiki page of the topic (`docs/wiki/<page>.md`, checked by tests/docs-links.test.ts). */
import { PLUGIN_ID } from "../contract.js";

export const WIKI_PAGES = [
	"Reports",
	"Events",
	"Goals-and-Funnels",
	"Search-Integrations",
	"Revenue-and-Refunds",
	"Search-Satisfaction",
	"Links-Report",
	"Annotations-and-Impact",
	"Data-Page",
	"Settings-Reference",
	"Definitions",
	"Multi-Site-and-Sites-View",
	"Dashboards-and-Sharing",
	"Postgres-Hyperdrive",
	"Move-Data",
] as const;
export type WikiPage = (typeof WIKI_PAGES)[number];

export const wikiUrl = (page: WikiPage): string => `https://github.com/infinitnet/${PLUGIN_ID}/wiki/${page}`;

/** The wiki page of an admin page, or a choice by the open tab and the All sites view. */
export type DocsLink = WikiPage | ((s: { tab: string | undefined; all: boolean }) => WikiPage);
