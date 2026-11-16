/** Copyable snippet forms of a client site: the master origin and the key only. */
import type { SnippetInfo } from "../routes/sites.js";

export interface Snippets {
	tag: string;
	tagManager: string;
	spa: string;
}

export function snippets(info: SnippetInfo, key: string): Snippets {
	const tag = `<script defer src="${info.src}" ${info.keyAttr}="${key}"></script>`;
	return {
		tag,
		// Tag Manager injects a Custom HTML tag as a classic script, so the script still finds its own element.
		tagManager: tag,
		spa: `window.${info.namespace} && window.${info.namespace}.page();`,
	};
}
