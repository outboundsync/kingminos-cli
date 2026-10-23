import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	classifyHttpError,
	type CliIo,
	EXIT,
	formatDecisionNotes,
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
		assert.match(result.stdout, /"confidence": "low"/);
		const parsed = JSON.parse(result.stdout);
		assert.equal(parsed.answer.safe_to_write, undefined);
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
