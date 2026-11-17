/** OpenAPI 3.1 document of the agent API, generated from the zod schemas; committed as `docs/openapi.json`. */
import { z } from "zod";
import { PLUGIN_ID } from "../contract.js";
import { SCOPES } from "../keys/scopes.js";
import { ENDPOINTS } from "./schemas.js";

const json = (schema: z.core.$ZodType) => {
	const { $schema: _s, ...rest } = z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }) as Record<string, unknown>;
	return rest;
};

/** Query string parameters from a flat object schema. */
function parameters(schema: z.core.$ZodType) {
	const s = json(schema) as { properties?: Record<string, unknown>; required?: string[] };
	return Object.entries(s.properties ?? {}).map(([name, p]) => ({ name, in: "query", required: s.required?.includes(name) ?? false, schema: p }));
}

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const content = (schema: unknown) => ({ "application/json": { schema } });

export function buildOpenApi(version: string) {
	const paths: Record<string, Record<string, unknown>> = {};
	for (const e of ENDPOINTS) {
		const op: Record<string, unknown> = {
			operationId: `${e.method.toLowerCase()}_${e.name.replace(/^agent\/v1\//, "").replace(/[^a-z0-9]+/gi, "_")}`,
			summary: e.summary,
			"x-scope": e.scope ?? "any",
			security: [{ apiKey: [] }],
			...(e.params ? { parameters: parameters(e.params) } : {}),
			...(e.body ? { requestBody: { required: true, content: content(json(e.body)) } } : {}),
			responses: {
				"200": e.name.endsWith("data/dump")
					? { description: "Rows, one JSON object per line.", content: { "application/x-ndjson": { schema: { type: "string" } } } }
					: { description: "Success.", content: content(e.name.endsWith("openapi.json") ? { type: "object" } : ref("Envelope")) },
				...(e.body || e.params ? { "400": { description: "Invalid input.", content: content(ref("Error")) } } : {}),
				"404": { description: "Missing, malformed, unknown, revoked or expired key, or a scope the key lacks. The body is an empty JSON object.", content: content({ type: "object", maxProperties: 0 }) },
				"429": { description: "Rate limit of the key reached; see Retry-After.", content: content(ref("Error")) },
			},
		};
		paths[`/${e.name}`] = { ...paths[`/${e.name}`], [e.method.toLowerCase()]: op };
	}
	return {
		openapi: "3.1.0",
		info: {
			title: "Cookieless Analytics agent API",
			version,
			description: `Aggregated analytics for agents and scripts. Send the key in the X-Api-Key header; Authorization: Bearer cannot be used because the host rejects unknown bearer tokens. Scopes: ${SCOPES.join(", ")}.`,
		},
		servers: [{ url: `/_emdash/api/plugins/${PLUGIN_ID}` }],
		security: [{ apiKey: [] }],
		paths,
		components: {
			securitySchemes: { apiKey: { type: "apiKey", in: "header", name: "X-Api-Key" } },
			schemas: {
				Envelope: {
					type: "object",
					required: ["ok", "data", "meta"],
					properties: {
						ok: { const: true },
						data: {},
						meta: {
							type: "object",
							required: ["site", "from", "to", "generatedAt", "truncated"],
							properties: {
								site: { type: "string" },
								from: { type: ["string", "null"] },
								to: { type: ["string", "null"] },
								generatedAt: { type: "string", format: "date-time" },
								truncated: { type: "boolean" },
							},
						},
					},
				},
				Error: { type: "object", required: ["ok", "error"], properties: { ok: { const: false }, error: { type: "string" }, message: { type: "string" } } },
			},
		},
	};
}
