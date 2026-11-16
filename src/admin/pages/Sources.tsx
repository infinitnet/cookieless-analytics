/** Sources (`/sources`): Channels, Sources, Campaigns (per UTM field), AI assistants. */
import { useState } from "react";
import type { View } from "../components/Header.js";
import { PageTrend, ReportPanel, sessionColumns, TabPage, trendMetrics } from "./report.js";

/** Channel of AI assistant referrals (`AI_CHANNEL` in `src/query/reports/sources.ts`, kept out of the admin bundle). */
export const AI_CHANNEL = "AI Assistants";

const UTM_FIELDS = [
	["utm_campaign", "Campaign"],
	["utm_source", "Source"],
	["utm_medium", "Medium"],
	["utm_term", "Term"],
	["utm_content", "Content"],
] as const;
type UtmField = (typeof UTM_FIELDS)[number][0];

function CampaignsTab({ view }: { view: View }) {
	const [field, setField] = useState<UtmField>("utm_campaign");
	const label = UTM_FIELDS.find((f) => f[0] === field)?.[1] ?? field;
	return (
		<>
			<label>
				UTM field{" "}
				<select value={field} onChange={(e) => setField(e.target.value as UtmField)}>
					{UTM_FIELDS.map(([id, l]) => (
						<option key={id} value={id}>
							{l}
						</option>
					))}
				</select>
			</label>
			<ReportPanel view={view} report="campaigns" title="Campaigns" revenue={field === "utm_campaign"} params={{ field }} columns={sessionColumns(label, field)} />
		</>
	);
}

export default function Sources() {
	return (
		<TabPage
			title="Sources"
			head={(v, tab) =>
				tab === "ai" ? (
					// The AI assistants tab charts that channel: the series follow the tab.
					<PageTrend view={{ ...v, state: { ...v.state, filters: [...v.state.filters, { dim: "channel", op: "is", values: [AI_CHANNEL] }] } }} id="sources" metrics={trendMetrics("visitors", "sessions")} title="Visits from AI assistants per day" />
				) : (
					<PageTrend view={v} id="sources" metrics={trendMetrics("visitors", "sessions")} />
				)
			}
			tabs={[
				["channels", "Channels", (v) => <ReportPanel view={v} report="channels" title="Channels" revenue columns={sessionColumns("Channel", "channel")} />],
				["sources", "Sources", (v) => <ReportPanel view={v} report="sources" title="Sources" revenue columns={sessionColumns("Source", "source")} />],
				["campaigns", "Campaigns", (v) => <CampaignsTab view={v} />],
				[
					"ai",
					"AI assistants",
					(v) => (
						<ReportPanel
							view={v}
							report="ai_referrals"
							title="Visits from AI assistants"
							extra={() => <p className="ca-small">A lower bound: many assistants send no referrer.</p>}
							columns={[
								{ key: "key", label: "Assistant", format: "text", dim: "source" },
								{ key: "visitors", label: "Visitors" },
								{ key: "sessions", label: "Sessions" },
								{ key: "landing", label: "Top landing pages", format: "text" },
							]}
							mapRows={(rows) => rows.map((r) => ({ ...r, landing: ((r.landing ?? []) as Array<{ path: string }>).map((l) => l.path).join(", ") }))}
						/>
					),
				],
			]}
		/>
	);
}
