/** Audience (`/audience`): Countries (with Regions when captured), Devices, Browsers, OS, Languages. */
import type { View } from "../components/Header.js";
import { Notice } from "../components/ui.js";
import { SETTINGS_HREF } from "../components/ReportNotices.js";
import { PageTrend, ReportPanel, sessionColumns, TabPage, trendMetrics } from "./report.js";

/** Regions, or a notice with the way to turn region capture on when the site's setting says it is off. */
function Regions({ view }: { view: View }) {
	if (view.site.captureRegion === false)
		return (
			<section className="ca-panel" aria-label="Regions">
				<h3>Regions</h3>
				<Notice tone="info" action={<a href={`${SETTINGS_HREF}?tab=privacy`}>Open plugin settings</a>}>
					Region capture is off. Turn on Capture region in the plugin settings to record regions from now on.
				</Notice>
			</section>
		);
	return <ReportPanel view={view} report="regions" title="Regions" showNotices={false} columns={sessionColumns("Region", "region")} />;
}

export default function Audience() {
	return (
		<TabPage
			title="Audience"
			docs="Reports"
			head={(v) => <PageTrend view={v} id="audience" metrics={trendMetrics("visitors", "sessions")} />}
			tabs={[
				[
					"countries",
					"Countries",
					(v) => (
						<>
							<ReportPanel view={v} report="countries" title="Countries" revenue columns={sessionColumns("Country", "country")} />
							<Regions view={v} />
						</>
					),
				],
				["devices", "Devices", (v) => <ReportPanel view={v} report="devices" title="Devices" revenue columns={sessionColumns("Device", "device")} />],
				["browsers", "Browsers", (v) => <ReportPanel view={v} report="browsers" title="Browsers" columns={sessionColumns("Browser", "browser")} />],
				["os", "OS", (v) => <ReportPanel view={v} report="os" title="Operating systems" columns={sessionColumns("Operating system", "os")} />],
				["languages", "Languages", (v) => <ReportPanel view={v} report="languages" title="Languages" columns={sessionColumns("Language", "lang")} />],
			]}
		/>
	);
}
