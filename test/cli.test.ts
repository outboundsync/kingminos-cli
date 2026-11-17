import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	classifyHttpError,
	type CliIo,
	EXIT,
	formatDecisionNotes,
	formatHumanResponseExtras,
	formatOptionsHints,
	formatQualityFlagsWarning,
	runCli,
	stripSafeToWrite,
} from "../dist/kingminos.js";

interface MockCall {
	url: string;
	method?: string;
	headers?: HeadersInit;
	body?: unknown;
}

function jsonResponse(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});
}

async function run(options: {
	argv: string[];
	env?: NodeJS.ProcessEnv;
	fetchImpl?: typeof fetch;
	calls?: MockCall[];
	status?: number;
	body?: unknown;
	stdin?: string;
}): Promise<{ code: number; stdout: string; stderr: string; calls: MockCall[] }> {
	const calls = options.calls ?? [];
	const fetchImpl: typeof fetch =
		options.fetchImpl ??
		(async (url, init) => {
			calls.push({
				url: String(url),
				method: init?.method,
				headers: init?.headers,
				body: init?.body ? JSON.parse(String(init.body)) : undefined,
			});
			return jsonResponse(
				options.status ?? 200,
				options.body ?? { ok: true, answer: { confidence: "high" }, usage: { credits: { spent: 1.2 } } },
			);
		});
	let stdout = "";
	let stderr = "";
	const io: CliIo = {
		argv: options.argv,
		env: options.env ?? { KINGMINOS_API_KEY: "osr_test" },
		stdout: (text: string) => {
			stdout += text;
		},
		stderr: (text: string) => {
			stderr += text;
		},
		fetch: fetchImpl,
		stdin: options.stdin ?? "",
	};
	const code = await runCli(io);
	return { code, stdout, stderr, calls };
}

describe("stripSafeToWrite", () => {
	it("removes nested safe_to_write keys", () => {
		assert.deepEqual(
			stripSafeToWrite({
				answer: { confidence: "high", safe_to_write: { description: true } },
				result: { phones: [{ number: "+1", safe_to_write: true }] },
			}),
			{
				answer: { confidence: "high" },
				result: { phones: [{ number: "+1" }] },
			},
		);
	});
});

describe("formatQualityFlagsWarning", () => {
	it("warns when result.quality_flags is non-empty", () => {
		assert.match(
			formatQualityFlagsWarning({
				result: { quality_flags: ["surname_initial_only"] },
			}),
			/Do not write this name/,
		);
	});

	it("prints nothing when quality_flags is absent", () => {
		assert.equal(formatQualityFlagsWarning({ result: {} }), "");
	});
});

describe("formatOptionsHints", () => {
	it("prints endpoints and est_credits", () => {
		const text = formatOptionsHints({
			options: [
				{
					endpoint: "/v1/person/b2b-social",
					description: "LinkedIn profile",
					est_credits: 1.2,
				},
				{
					endpoint: "/v1/person/name",
					path: "coverage",
					description: "Max yield",
					est_credits: 3.4,
				},
			],
		});
		assert.match(text, /Options/);
		assert.match(text, /\/v1\/person\/b2b-social ~1.2 credits/);
		assert.match(text, /\[coverage\] ~3.4 credits/);
	});
});

describe("formatHumanResponseExtras", () => {
	it("combines warnings, options, and next steps", () => {
		const text = formatHumanResponseExtras({
			answer: { confidence: "low" },
			result: { quality_flags: ["surname_truncated"] },
			options: [{ endpoint: "/v1/person/name", path: "accuracy", est_credits: 2, description: "x" }],
			agent_guidance: "Present options and wait.",
			next_steps: [{ action: "call_capability", endpoint: "/v1/person/b2b-social", reason: "gap" }],
		});
		assert.match(text, /Confidence: low/);
		assert.match(text, /Warning: quality_flags/);
		assert.match(text, /Options/);
		assert.match(text, /Agent: Present options/);
		assert.match(text, /Next:/);
		assert.match(text, /\/v1\/person\/b2b-social/);
	});
});

describe("formatDecisionNotes", () => {
	it("prints confidence and spent credits from the API", () => {
		assert.equal(
			formatDecisionNotes({
				answer: { confidence: "medium" },
				usage: { credits: { spent: 1.4 } },
			}),
			"\nConfidence: medium\nCredits spent: 1.4\n",
		);
	});

	it("prints nothing when those fields are absent", () => {
		assert.equal(formatDecisionNotes({ ok: true }), "");
	});
});

describe("classifyHttpError", () => {
	it("maps 401 / 402 / 429 / 5xx / other", () => {
		assert.equal(classifyHttpError(401, { detail: "missing" }).exitCode, EXIT.unauthorized);
		assert.match(classifyHttpError(401, { detail: "missing" }).message, /missing Bearer token/);
		assert.equal(classifyHttpError(402, { error: "payment_required" }).exitCode, EXIT.payment);
		assert.match(classifyHttpError(402, {}).message, /Out of credits/);
		assert.equal(
			classifyHttpError(429, { error: "key_budget_exhausted" }).exitCode,
			EXIT.rateLimited,
		);
		assert.match(
			classifyHttpError(429, { error: "key_budget_exhausted" }).message,
			/daily key budget/,
		);
		assert.equal(classifyHttpError(503, { error: "store_unavailable" }).exitCode, EXIT.server);
		assert.equal(classifyHttpError(400, { error: "validation_failed" }).exitCode, EXIT.http);
	});
});

describe("runCli", () => {
	it("prints root help", async () => {
		const result = await run({ argv: ["--help"] });
		assert.equal(result.code, EXIT.ok);
		assert.match(result.stdout, /King Minos CLI/);
		assert.equal(result.stderr, "");
	});

	it("prints package version with --version", async () => {
		const result = await run({ argv: ["--version"] });
		assert.equal(result.code, EXIT.ok);
		assert.match(result.stdout, /^\d+\.\d+\.\d+(-dev)?\n$/);
		assert.equal(result.stderr, "");
	});

	it("exits 1 on usage errors", async () => {
		const result = await run({ argv: ["nope"] });
		assert.equal(result.code, EXIT.usage);
		assert.match(result.stderr, /unknown command nope/);
	});

	it("requires a token for authenticated commands", async () => {
		const result = await run({ argv: ["providers"], env: {} });
		assert.equal(result.code, EXIT.usage);
		assert.match(result.stderr, /KINGMINOS_API_KEY/);
	});

	it("builds a company.domain request against the default host", async () => {
		const result = await run({
			argv: ["company", "domain", "--domain", "example.com", "--priority", "speed"],
		});
		assert.equal(result.code, EXIT.ok);
		assert.equal(result.calls.length, 1);
		assert.equal(result.calls[0]?.url, "https://api.kingminos.com/v1/company/domain");
		assert.equal(result.calls[0]?.method, "POST");
		assert.deepEqual(result.calls[0]?.body, {
			domain: "example.com",
			routing: { path: "speed" },
		});
		assert.match(result.stdout, /"ok": true/);
		assert.match(result.stdout, /Confidence: high/);
		assert.match(result.stdout, /Credits spent: 1.2/);
	});

	it("omits human extras and safe_to_write for --json", async () => {
		const result = await run({
			argv: ["--json", "company", "icon", "--domain", "example.com"],
			body: {
				ok: true,
				answer: { confidence: "low", safe_to_write: { icon_url: true } },
				usage: { credits: { spent: 0 } },
				next_steps: [{ action: "retry_with_dial", reason: "try balance", est_credits: 1.2 }],
			},
		});
		assert.equal(result.code, EXIT.ok);
		assert.doesNotMatch(result.stdout, /safe_to_write/);
		assert.doesNotMatch(result.stdout, /Confidence:/);
		assert.doesNotMatch(result.stdout, /Next:/);
		assert.doesNotMatch(result.stdout, /Options/);
		assert.doesNotMatch(result.stdout, /quality_flags/);
		assert.match(result.stdout, /"confidence": "low"/);
		assert.match(result.stdout, /"next_steps"/);
		const parsed = JSON.parse(result.stdout);
		assert.equal(parsed.answer.safe_to_write, undefined);
	});

	it("prints person.name human extras in human mode", async () => {
		const result = await run({
			argv: ["person", "name", "--email", "ada@example.com"],
			body: {
				ok: true,
				answer: { confidence: "medium" },
				result: {
					first_name: "Ada",
					last_name: "L",
					quality_flags: ["surname_initial_only"],
				},
				options: [
					{
						endpoint: "/v1/person/name",
						path: "coverage",
						description: "Broader name sources",
						est_credits: 3.2,
					},
				],
				agent_guidance: "Show options and let the user choose the path.",
				next_steps: [{ action: "call_capability", endpoint: "/v1/person/b2b-social", reason: "Need profile" }],
			},
		});
		assert.match(result.stdout, /"quality_flags"/);
		assert.match(result.stdout, /Warning: quality_flags/);
		assert.match(result.stdout, /Options/);
		assert.match(result.stdout, /~3.2 credits/);
		assert.match(result.stdout, /Agent: Show options/);
		assert.match(result.stdout, /Next:/);
	});

	it("prints Next: hints in human mode", async () => {
		const result = await run({
			argv: ["company", "b2b-social", "--domain", "example.com"],
			body: {
				ok: true,
				next_steps: [
					{
						action: "retry_with_dial",
						capability: "company.b2b_social",
						reason: "Retry at accuracy",
						est_credits: 1.4,
					},
				],
			},
		});
		assert.match(result.stdout, /Next:/);
		assert.match(result.stdout, /company.b2b_social/);
		assert.match(result.stdout, /~1.4 credits/);
	});

	it("maps 401 to exit 2", async () => {
		const result = await run({
			argv: ["providers"],
			status: 401,
			body: { ok: false, error: "unauthorized", detail: "mismatch" },
		});
		assert.equal(result.code, EXIT.unauthorized);
		assert.match(result.stderr, /Unauthorized \(401\): API key did not match/);
	});

	it("maps 402 to exit 3", async () => {
		const result = await run({
			argv: ["company", "resolve", "--email", "ada@example.com"],
			status: 402,
			body: { ok: false, error: "payment_required" },
		});
		assert.equal(result.code, EXIT.payment);
		assert.match(result.stderr, /Out of credits \(402\)/);
	});

	it("maps 429 to exit 4", async () => {
		const result = await run({
			argv: ["capabilities"],
			status: 429,
			body: { ok: false, error: "rate_limited", hint: "Retry-After: 2" },
		});
		assert.equal(result.code, EXIT.rateLimited);
		assert.match(result.stderr, /Rate limited \(429\)/);
	});

	it("maps 503 to exit 5", async () => {
		const result = await run({
			argv: ["health"],
			status: 503,
			body: { ok: false, error: "store_unavailable", retryable: true },
		});
		assert.equal(result.code, EXIT.server);
		assert.match(result.stderr, /KingMinos server error \(503\)/);
	});

	it("maps other 4xx to exit 6", async () => {
		const result = await run({
			argv: ["company", "domain", "--domain", "x"],
			status: 400,
			body: { ok: false, error: "validation_failed" },
		});
		assert.equal(result.code, EXIT.http);
		assert.match(result.stderr, /HTTP 400/);
	});

	it("prints only the JSON error body when --json is set", async () => {
		const result = await run({
			argv: ["--json", "providers"],
			status: 401,
			body: { ok: false, error: "unauthorized", detail: "missing" },
		});
		assert.equal(result.code, EXIT.unauthorized);
		assert.doesNotMatch(result.stderr, /Unauthorized \(401\)/);
		assert.match(result.stderr, /"error": "unauthorized"/);
	});

	it("sends the Bearer token from --token", async () => {
		const result = await run({
			argv: ["--token", "osr_flag", "providers"],
			env: {},
		});
		assert.equal(result.code, EXIT.ok);
		const headers = new Headers(result.calls[0]?.headers);
		assert.equal(headers.get("authorization"), "Bearer osr_flag");
		assert.equal(headers.get("x-kingminos-client"), "cli");
	});
});

describe("pricing", () => {
	// Shape of GET /v1/pricing (kingminos.pricing.v1); the numbers are made up.
	const pricing = {
		ok: true,
		schema: "kingminos.pricing.v1",
		pricing_version: "abc123",
		currency: "USD",
		credit_unit: "credit",
		notes: ["A miss bills 0."],
		capabilities: [
			{
				id: "company.resolve",
				default_path: "balance",
				paths: [
					{ name: "speed", cap: 7, delivered: { min: 0, typical: null, max: 7 }, byok: 0.3, miss: 0 },
					{ name: "balance", cap: 9, delivered: { min: 4, typical: 4, max: 4 }, byok: 0.3, miss: 0 },
				],
				opt_in_hops: [],
			},
			{
				id: "person.title",
				outcome_priced: true,
				default_path: "balance",
				paths: [{ name: "balance", cap: 8, delivered: 6.5, byok: 0.3, miss: 0 }],
				opt_in_hops: [{ provider: "wiza", price: 11, note: "Off every default path." }],
			},
		],
		plans: { payg: { per_credit_usd: 0.9 } },
	};

	it("prints a table of delivered prices without an API key", async () => {
		const result = await run({ argv: ["pricing"], env: {}, body: pricing });
		assert.equal(result.code, EXIT.ok);
		assert.equal(result.calls[0]?.url, "https://api.kingminos.com/v1/pricing");
		assert.equal(result.calls[0]?.method, "GET");
		assert.equal(new Headers(result.calls[0]?.headers).get("authorization"), null);
		assert.equal(
			result.stdout,
			[
				"Credits per delivered answer, pricing_version abc123",
				"",
				"CAPABILITY       PATH                DELIVERED",
				"company.resolve  speed               0–7",
				"                 balance (default)   4",
				"person.title     balance (default)   6.5",
				"                 +wiza (opt-in hop)  11",
				"",
				"A miss bills 0.",
				"",
				"Plans, BYOK fees and the full table: kingminos pricing --json",
				"",
			].join("\n"),
		);
		assert.equal(result.stderr, "");
	});

	it("prints the raw JSON with --json", async () => {
		const result = await run({ argv: ["pricing", "--json"], env: {}, body: pricing });
		assert.equal(result.code, EXIT.ok);
		assert.deepEqual(JSON.parse(result.stdout), pricing);
	});

	it("falls back to JSON when the body is not a pricing table", async () => {
		const result = await run({ argv: ["pricing"], env: {}, body: { ok: true, capabilities: [{ id: 1 }] } });
		assert.equal(result.code, EXIT.ok);
		assert.deepEqual(JSON.parse(result.stdout), { ok: true, capabilities: [{ id: 1 }] });
	});

	it("does not send a token even when one is set", async () => {
		const result = await run({ argv: ["pricing"], body: pricing });
		assert.equal(result.code, EXIT.ok);
		assert.equal(new Headers(result.calls[0]?.headers).get("authorization"), null);
	});
});
