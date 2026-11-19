/** Numbered setup steps of a connection form; a step may carry a link to the console page it names. */
import type { ReactNode } from "react";

export const SETUP_LINKS = {
	googleProject: "https://console.cloud.google.com/projectcreate",
	googleApi: "https://console.cloud.google.com/apis/library/searchconsole.googleapis.com",
	googleAudience: "https://console.cloud.google.com/auth/audience",
	googleClients: "https://console.cloud.google.com/auth/clients",
	googleServiceAccounts: "https://console.cloud.google.com/iam-admin/serviceaccounts",
	searchConsoleUsers: "https://search.google.com/search-console/users",
	bing: "https://www.bing.com/webmasters",
} as const;

export function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
	return (
		<a href={href} target="_blank" rel="noopener noreferrer">
			{children}
		</a>
	);
}

export function SetupSteps({ label, steps }: { label: string; steps: readonly ReactNode[] }) {
	return (
		<ol className="ca-help ca-setup" aria-label={label}>
			{steps.map((s, i) => (
				<li key={i}>{s}</li>
			))}
		</ol>
	);
}
