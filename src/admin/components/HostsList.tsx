/** Config, Sites tab: the hosts of this site, linked hosts included, with the last event seen from each and the limits of a visit across hosts. */
import { useEffect, useState } from "react";
import type { HostEntry } from "../../routes/sites.js";
import { call, errorText } from "../api.js";
import { Loading, Notice } from "./ui.js";

/** The limits of one visit across linked hosts, shown under the list. */
export const HOST_HINTS = [
	"A visit continues across the hosts through the visitor key (the network address, the browser and the daily salt). A change of network or browser in the middle of a visit, for example from Wi-Fi to mobile data, starts a new visit.",
	"A payment finished in another app or on another network (a banking app on mobile data) returns with a different network address and starts a new visit. Add the payment hosts to Ignored referrer hosts so that visit does not count as a referral from the payment page.",
	"The salt changes once a day at the salt rotation hour. For one session window after it, a move to another host still finds the running visit; a later move starts a new visit and the person counts as a new visitor.",
	"Last event times are updated about every 10 minutes, for this site's own host only when Site origin is set.",
];

export function HostsList() {
	const [hosts, setHosts] = useState<HostEntry[] | null>(null);
	const [error, setError] = useState<string | null>(null);
	useEffect(() => {
		call<{ hosts: HostEntry[] }>("sites/hosts").then(
			(r) => setHosts(r.hosts),
			(e: unknown) => setError(errorText(e)),
		);
	}, []);
	if (error) return <Notice tone="error">{error}</Notice>;
	if (!hosts) return <Loading />;
	return (
		<section aria-label="Hosts of this site">
			<h3>Hosts of this site</h3>
			<div className="ca-table-scroll">
				<table aria-label="Hosts">
					<thead>
						<tr>
							{["Host", "Kind", "Last event"].map((h) => (
								<th key={h}>{h}</th>
							))}
						</tr>
					</thead>
					<tbody>
						{hosts.map((h) => (
							<tr key={h.host}>
								<td>
									<code>{h.host}</code>
								</td>
								<td>{h.kind === "own" ? "this site" : `linked: ${h.site ?? ""}${h.paused ? " (paused)" : ""}`}</td>
								<td>{h.lastEvent === null ? "none seen" : new Date(h.lastEvent).toLocaleString()}</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
			{/* Paragraphs, not a list: they start at the table edge. */}
			<div className="ca-small">
				{HOST_HINTS.map((t) => (
					<p key={t}>{t}</p>
				))}
			</div>
		</section>
	);
}
