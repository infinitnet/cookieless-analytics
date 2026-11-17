/**
 * "Import Bing data from a file": the guaranteed path when the Bing API refuses this server. Reads one
 * CSV export of Bing Webmaster Tools (Search Performance, keywords or pages) and posts it to
 * `search/import` for the selected site. A file without a date column is stored on the chosen day.
 * It sits in the Bing card of Search Connections under its own disclosure, which names it.
 */
import { Button } from "@cloudflare/kumo";
import { useState } from "react";
import { call, errorText, withApiSite } from "../api.js";
import { Field, Notice } from "./ui.js";

/** The server's limit (`CSV_MAX_CHARS`); checked here first so a large file is refused before upload. */
const MAX_BYTES = 500_000;

interface ImportResult {
	kind: "query" | "page" | "totals";
	days: number;
	rows: number;
	skipped: number;
	from: string | null;
	to: string | null;
}
const KIND = { query: "query", page: "page", totals: "daily total" } as const;

export function BingImport({ yesterday, onDone }: { yesterday: string; onDone: () => void }) {
	const [file, setFile] = useState<File | null>(null);
	const [day, setDay] = useState("");
	const [busy, setBusy] = useState(false);
	const [msg, setMsg] = useState<{ text: string; tone: "success" | "error" } | null>(null);
	const upload = async () => {
		if (!file) return;
		setMsg(null);
		if (file.size > MAX_BYTES) return setMsg({ text: "The file is larger than 500 KB. Export a shorter date range.", tone: "error" });
		setBusy(true);
		try {
			const r = await call<ImportResult>("search/import", withApiSite({ source: "bing", csv: await file.text(), ...(day ? { day } : {}) }));
			setMsg({ text: `Imported ${r.rows} ${KIND[r.kind]} rows on ${r.days} day${r.days === 1 ? "" : "s"}${r.from ? ` (${r.from} to ${r.to})` : ""}${r.skipped ? `; ${r.skipped} rows skipped` : ""}.`, tone: "success" });
			onDone();
		} catch (e) {
			setMsg({ text: errorText(e), tone: "error" });
		} finally {
			setBusy(false);
		}
	};
	return (
		<div className="ca-stack">
			<p className="ca-help">
				When the Bing API keeps refusing this server, import Bing's own export instead. In Bing Webmaster Tools open Search Performance, pick the date range, then download the Keywords table and the Pages table as CSV. Import each file here; a new import of a table replaces that table's rows on the same days.
			</p>
			{msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
			<div className="ca-row-end">
				<Field label="CSV file">
					<input type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
				</Field>
				<Field label="Day for files without dates" help="Rows of a file without a Date column are stored on this day, for example the last day of the exported range.">
					<input type="date" value={day} max={yesterday} onChange={(e) => setDay(e.target.value)} />
				</Field>
				<Button variant="primary" size="sm" disabled={!file || busy} onClick={() => void upload()}>
					{busy ? "Importing" : "Import file"}
				</Button>
			</div>
		</div>
	);
}
