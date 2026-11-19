/**
 * Bing sign-in on the Bing connection card: the API key (default) or the site's own OAuth client from
 * Bing Webmaster Tools. OAuth saves the client, asks `search/oauth/start` with `source: "bing"` and opens
 * Bing; the Search page finishes the return like Google's. `redirect` is the copyable redirect URI.
 */
import { ExternalLink, SETUP_LINKS, SetupSteps } from "./SetupSteps.js";
import { Button, Input } from "@cloudflare/kumo";
import { type ReactNode, useState } from "react";
import { call } from "../api.js";
import { Segmented } from "./ui.js";

export function BingSignIn({ configured, auth, run, redirect }: { configured: boolean; auth: "apikey" | "oauth"; run: (f: () => Promise<unknown>, done: string, tone?: "info") => Promise<void>; redirect: ReactNode }) {
	const [mode, setMode] = useState<"apikey" | "oauth">(auth);
	const [key, setKey] = useState("");
	const [clientId, setClientId] = useState("");
	const [secret, setSecret] = useState("");
	const off = configured && (
		<Button variant="secondary-destructive" size="sm" onClick={() => void run(() => call("search/connect", { bingEnabled: false }), "Bing is off.")}>
			Turn Bing off
		</Button>
	);
	return (
		<>
			<Segmented label="Bing sign-in" value={mode} options={[["apikey", "API key"], ["oauth", "OAuth client"]]} onChange={setMode} radio />
			{mode === "apikey" ? (
				<div className="ca-form">
					<SetupSteps
						label="Bing API key setup"
						steps={[
							<>
								Open <ExternalLink href={SETUP_LINKS.bing}>Bing Webmaster Tools</ExternalLink> and add and verify the site (or import it from Search Console).
							</>,
							<>Open Settings, API access, and choose Generate API key.</>,
						]}
					/>
					<Input label="API key" description="Generated once; Bing shows it in API access." type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} />
					<div className="ca-actions">
						<Button variant="primary" size="sm" disabled={!key.trim()} onClick={() => void run(() => call("search/connect", { bingEnabled: true, bingAuth: "apikey", bingApiKey: key }).then(() => setKey("")), "Bing key saved. Pick the site below.")}>
							Save Bing key
						</Button>
						{off}
					</div>
				</div>
			) : (
				<div className="ca-form">
					<div className="ca-stack">
						<p className="ca-help">In <ExternalLink href={SETUP_LINKS.bing}>Bing Webmaster Tools</ExternalLink> open Settings, API access, OAuth client, create a client and add this redirect URI:</p>
						{redirect}
					</div>
					<Input label="Bing client ID" value={clientId} autoComplete="off" onChange={(e) => setClientId(e.target.value)} />
					<Input label="Bing client secret" type="password" autoComplete="off" value={secret} onChange={(e) => setSecret(e.target.value)} />
					<div className="ca-actions">
						<Button
							variant="primary"
							size="sm"
							onClick={() =>
								void run(
									async () => {
										await call("search/connect", { bingEnabled: true, bingAuth: "oauth", ...(clientId ? { bingClientId: clientId } : {}), ...(secret ? { bingClientSecret: secret } : {}) });
										const { url } = await call<{ url: string }>("search/oauth/start", { source: "bing" });
										window.location.assign(url);
									},
									"Opening Bing",
									"info",
								)
							}
						>
							Connect Bing
						</Button>
						{off}
					</div>
					<p className="ca-help">Opens Bing to grant read access to Webmaster Tools.</p>
				</div>
			)}
		</>
	);
}
