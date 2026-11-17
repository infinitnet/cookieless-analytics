/**
 * Schedule email dialog of the Dashboards page: frequency, weekday or month day, hour in the site
 * timezone, recipients, range, compare, subject; the provider state; Send test. Saving goes through
 * `dashboards/email/save`, the only writer of the schedule.
 */
import { Button } from "@cloudflare/kumo";
import { type FormEvent, useEffect, useState } from "react";
import { PRESETS, type Preset } from "../../core/presets.js";
import { type Dashboard, EmailSettings, MAIL_MAX_RECIPIENTS } from "../../dashboards/schema.js";
import { call, errorText } from "../api.js";
import { Notice } from "./ui.js";

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const pad = (n: number) => String(n).padStart(2, "0");
const when = (ts: number) => new Date(ts * 1000).toISOString().slice(0, 16).replace("T", " ");

/** The weekly digest preset: weekly, Monday 08:00, compared with the previous period. */
export const DIGEST_SCHEDULE = { enabled: true, frequency: "weekly" as const, weekday: 1, monthday: 1, hour: 8, range: "7d" as Preset, compare: true };

export interface ScheduleDialogProps {
	dashboard: Dashboard & { recipientCount?: number };
	/** Body field `site` (left out for the local site). */
	site: { site?: string };
	/** Start values instead of the stored schedule (the weekly digest button). */
	preset?: Partial<typeof DIGEST_SCHEDULE>;
	saved: (d: Dashboard) => void;
	close: () => void;
}

export function ScheduleDialog({ dashboard, site, preset, saved, close }: ScheduleDialogProps) {
	const cur = dashboard.email;
	const [form, setForm] = useState({
		enabled: cur?.enabled ?? true,
		frequency: cur?.frequency ?? "weekly",
		weekday: cur?.weekday ?? 1,
		monthday: cur?.monthday ?? 1,
		hour: cur?.hour ?? 8,
		range: cur?.range ?? dashboard.defaults.range,
		compare: cur?.compare ?? false,
		subject: cur?.subject ?? "",
		...preset,
	});
	const [recipients, setRecipients] = useState((cur?.recipients ?? []).join("\n"));
	const [provider, setProvider] = useState<{ provider: boolean; message?: string } | null>(null);
	const [msg, setMsg] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	useEffect(() => {
		call<{ provider: boolean; message?: string }>("dashboards/email/status", site).then(setProvider, () => setProvider(null));
	}, []);
	const list = recipients
		.split(/[\n,;]+/)
		.map((r) => r.trim())
		.filter(Boolean);
	const body = { ...form, recipients: list, ...(form.subject.trim() ? { subject: form.subject.trim() } : { subject: undefined }) };
	const check = EmailSettings.safeParse(body);
	const hidden = !!cur && !cur.recipients && (dashboard.recipientCount ?? 0) > 0;
	const set = (p: Partial<typeof form>) => setForm({ ...form, ...p });
	const save = async (e: FormEvent) => {
		e.preventDefault();
		setError(null);
		setMsg(null);
		if (!check.success) return;
		try {
			saved(await call<Dashboard>("dashboards/email/save", { id: dashboard.id, ...site, email: check.data }));
			setMsg(form.enabled ? "Schedule saved." : "Schedule turned off.");
		} catch (err) {
			setError(errorText(err));
		}
	};
	const test = async () => {
		setError(null);
		setMsg(null);
		try {
			const r = await call<{ to: string }>("dashboards/email/send-test", { id: dashboard.id, ...site });
			setMsg(`A test email was sent to ${r.to}.`);
		} catch (err) {
			setError(errorText(err));
		}
	};
	return (
		<section aria-label="Schedule email" className="ca-panel">
			<h3>Schedule email</h3>
			<p>The dashboard is sent as a table based email to the recipients below, through the email provider of this site. Recipients are kept with the dashboard. Times are in the site timezone.</p>
			{provider && !provider.provider && <Notice tone="warning">{provider.message ?? "No email provider is configured."} The schedule is saved, but nothing is sent until a provider is active.</Notice>}
			{error && <Notice tone="error">{error}</Notice>}
			{msg && <Notice tone={/^(Failed|Stopped)/.test(msg) ? "error" : "success"}>{msg}</Notice>}
			{cur?.lastSent !== undefined && <p>Last sent {when(cur.lastSent)} UTC.</p>}
			{cur?.lastError && <Notice tone="warning">The last send failed: {cur.lastError}</Notice>}
			{dashboard.emailNext !== undefined && <p>Next send {when(dashboard.emailNext)} UTC.</p>}
			<form aria-label="Email schedule" onSubmit={save} className="ca-form">
				<label>
					<input type="checkbox" checked={form.enabled} onChange={(e) => set({ enabled: e.target.checked })} /> Send this dashboard by email
				</label>
				<label>
					Frequency{" "}
					<select value={form.frequency} onChange={(e) => set({ frequency: e.target.value as "weekly" | "monthly" })}>
						<option value="weekly">Weekly</option>
						<option value="monthly">Monthly</option>
					</select>
				</label>
				{form.frequency === "weekly" ? (
					<label>
						Weekday{" "}
						<select value={form.weekday} onChange={(e) => set({ weekday: Number(e.target.value) })}>
							{WEEKDAYS.map((d, i) => (
								<option key={d} value={i + 1}>
									{d}
								</option>
							))}
						</select>
					</label>
				) : (
					<label>
						Day of the month{" "}
						<select value={form.monthday} onChange={(e) => set({ monthday: Number(e.target.value) })}>
							{Array.from({ length: 28 }, (_, i) => (
								<option key={i} value={i + 1}>
									{i + 1}
								</option>
							))}
						</select>
					</label>
				)}
				<label>
					Hour{" "}
					<select value={form.hour} onChange={(e) => set({ hour: Number(e.target.value) })}>
						{Array.from({ length: 24 }, (_, h) => (
							<option key={h} value={h}>
								{pad(h)}:00
							</option>
						))}
					</select>
				</label>
				<label>
					Recipients (one per line, at most {MAIL_MAX_RECIPIENTS}){" "}
					<textarea rows={3} value={recipients} placeholder={hidden ? `${dashboard.recipientCount} recipients, visible to Admins only` : "reports@example.com"} onChange={(e) => setRecipients(e.target.value)} />
				</label>
				<label>
					Range{" "}
					<select value={form.range} onChange={(e) => set({ range: e.target.value as Preset })}>
						{PRESETS.map(([id, label]) => (
							<option key={id} value={id}>
								{label}
							</option>
						))}
					</select>
				</label>
				<label>
					<input type="checkbox" checked={form.compare} onChange={(e) => set({ compare: e.target.checked })} /> Compare with the previous period
				</label>
				<label>
					Subject (optional) <input value={form.subject} maxLength={80} onChange={(e) => set({ subject: e.target.value })} />
				</label>
				{!check.success && list.length > 0 && <p role="alert" className="ca-field-error">{check.error.issues[0]?.message}</p>}
				<div>
					<Button variant="primary" size="sm" type="submit" disabled={!check.success}>
						Save schedule
					</Button>{" "}
					<Button variant="primary" size="sm" onClick={test} disabled={provider?.provider === false}>
						Send test
					</Button>{" "}
					<Button size="sm" onClick={close}>
						Close
					</Button>
				</div>
				<small>Send test goes to your own address only, at most once a minute.</small>
			</form>
		</section>
	);
}
