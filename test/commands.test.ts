import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildRequest } from "../dist/kingminos.js";
import type { Command, FlagMap } from "../src/parse.ts";

const loader = { readFile: () => "", stdin: "" };

function flags(map: FlagMap): FlagMap {
	return map;
}

describe("buildRequest", () => {
	it("builds unauthenticated GETs", () => {
		assert.deepEqual(buildRequest({ name: "health" }, {}, loader), {
			method: "GET",
			path: "/health",
			headers: {},
			auth: false,
		});
		assert.deepEqual(buildRequest({ name: "openapi" }, {}, loader), {
			method: "GET",
			path: "/openapi.yaml",
			headers: {},
			auth: false,
		});
	});

	it("builds discovery GETs", () => {
		assert.equal(buildRequest({ name: "providers" }, {}, loader).path, "/v1/providers");
		assert.equal(buildRequest({ name: "capabilities" }, {}, loader).path, "/v1/capabilities");
		assert.equal(buildRequest({ name: "recipes" }, {}, loader).path, "/v1/recipes");
		assert.equal(buildRequest({ name: "providers" }, {}, loader).auth, true);
	});

	const posts: Array<{ command: Command; path: string; extra?: FlagMap; body: Record<string, unknown> }> =
		[
			{
				command: { name: "company.resolve" },
				path: "/v1/company/resolve",
				extra: { email: "ada@example.com", priority: "speed" },
				body: { email: "ada@example.com", routing: { path: "speed" } },
			},
			{
				command: { name: "company.domain" },
				path: "/v1/company/domain",
				extra: { domain: "example.com", "skip-cache": true, priority: "balance" },
				body: { domain: "example.com", skip_cache: true, routing: { path: "balance" } },
			},
			{
				command: { name: "company.hierarchy" },
				path: "/v1/company/hierarchy",
				extra: { domain: "example.com", country: "US" },
				body: { domain: "example.com", country: "US" },
			},
			{
				command: { name: "company.b2b_social" },
				path: "/v1/company/b2b-social",
				extra: {
					domain: "example.com",
					hint: "UK PR agency",
					country: "GB",
					priority: "accuracy",
				},
				body: {
					domain: "example.com",
					hint: "UK PR agency",
					country: "GB",
					routing: { path: "accuracy" },
				},
			},
			{
				command: { name: "company.icon" },
				path: "/v1/company/icon",
				extra: { domain: "example.com" },
				body: { domain: "example.com" },
			},
			{
				command: { name: "company.description" },
				path: "/v1/company/description",
				extra: { domain: "example.com", "max-chars": "200", "skip-cache": true },
				body: { domain: "example.com", max_chars: 200, skip_cache: true },
			},
			{
				command: { name: "person.verify_employment" },
				path: "/v1/person/verify-employment",
				extra: {
					email: "ada@example.com",
					"expected-company-domain": "example.com",
				},
				body: {
					email: "ada@example.com",
					expected_company: { domain: "example.com" },
				},
			},
			{
				command: { name: "person.language" },
				path: "/v1/person/language",
				extra: { email: "ada@example.com", "skip-cache": true, priority: "balance" },
				body: { email: "ada@example.com", skip_cache: true, routing: { path: "balance" } },
			},
			{
				command: { name: "person.phone" },
				path: "/v1/person/phone",
				extra: {
					email: "ada@example.com",
					domain: "example.com",
					"phone-types": "mobile,landline",
					"max-results": "2",
					format: "e164",
				},
				body: {
					email: "ada@example.com",
					domain: "example.com",
					phone_types: ["mobile", "landline"],
					max_results: 2,
					format: "e164",
				},
			},
			{
				command: { name: "person.title" },
				path: "/v1/person/title",
				extra: {
					email: "ada@example.com",
					"company-domain": "example.com",
					fields: "title,seniority",
					path: "coverage",
				},
				body: {
					email: "ada@example.com",
					company_domain: "example.com",
					fields: ["title", "seniority"],
					routing: { path: "coverage" },
				},
			},
			{
				command: { name: "person.name" },
				path: "/v1/person/name",
				extra: {
					"linkedin-url": "https://www.linkedin.com/in/example",
					routing: '{"only":["leadmagic"]}',
					path: "accuracy",
					"skip-cache": true,
				},
				body: {
					linkedin_url: "https://www.linkedin.com/in/example",
					skip_cache: true,
					routing: { only: ["leadmagic"], path: "accuracy" },
				},
			},
		];

	for (const { command, path, extra, body } of posts) {
		it(`builds ${command.name}`, () => {
			const request = buildRequest(command, flags(extra ?? {}), loader);
			assert.equal(request.method, "POST");
			assert.equal(request.path, path);
			assert.equal(request.auth, true);
			assert.deepEqual(request.body, body);
		});
	}

	it("applies --priority over --path for person.name", () => {
		const request = buildRequest(
			{ name: "person.name" },
			flags({ email: "ada@example.com", path: "speed", priority: "coverage", cache: "bypass" }),
			loader,
		);
		assert.deepEqual(request.body, { email: "ada@example.com", routing: { path: "coverage" } });
		assert.equal(request.headers["X-Router-Cache"], "bypass");
	});

	it("adds explain / schema / cache headers when asked", () => {
		const request = buildRequest(
			{ name: "company.domain" },
			flags({
				domain: "example.com",
				explain: "full",
				schema: "2",
				"idempotency-key": "abc",
				"max-provider-credits": "4",
				cache: "bypass",
				"cache-control": "no-cache",
			}),
			loader,
		);
		assert.deepEqual(request.headers, {
			"X-Router-Explain": "full",
			"X-Router-Schema": "2",
			"Idempotency-Key": "abc",
			"X-Router-Max-Provider-Credits": "4",
			"X-Router-Cache": "bypass",
			"Cache-Control": "no-cache",
		});
	});

	it("builds runs.get and subject erase", () => {
		assert.equal(
			buildRequest({ name: "runs.get", id: "run/1" }, {}, loader).path,
			"/v1/runs/run%2F1",
		);
		assert.equal(
			buildRequest({ name: "subjects.delete", subjectKey: "email:a@b.com" }, {}, loader).path,
			"/v1/subjects/email%3Aa%40b.com",
		);
	});

	it("builds credentials put for zoominfo and api-key vendors", () => {
		const zoom = buildRequest(
			{ name: "credentials.put", provider: "zoominfo" },
			flags({ "client-id": "id", "client-secret": "sec" }),
			loader,
		);
		assert.equal(zoom.method, "PUT");
		assert.equal(zoom.path, "/v1/credentials/zoominfo");
		assert.deepEqual(zoom.body, { clientId: "id", clientSecret: "sec" });

		const key = buildRequest(
			{ name: "credentials.put", provider: "leadmagic" },
			flags({ "api-key": "lm_key" }),
			loader,
		);
		assert.deepEqual(key.body, { apiKey: "lm_key" });
	});

	it("rejects websearch credentials (house-only)", () => {
		assert.throws(
			() => buildRequest({ name: "credentials.put", provider: "websearch" }, {}, loader),
			{ message: /websearch is house-only/ },
		);
	});

	it("rejects help and batch as HTTP calls", () => {
		assert.throws(() => buildRequest({ name: "help" }, {}, loader), {
			message: /help is not an HTTP call/,
		});
		assert.throws(
			() => buildRequest({ name: "batch", capability: "company.domain" }, {}, loader),
			{ message: /batch is not a single HTTP call/ },
		);
	});

	it("rejects an out-of-range --max-chars", () => {
		assert.throws(
			() =>
				buildRequest(
					{ name: "company.description" },
					flags({ domain: "example.com", "max-chars": "10" }),
					loader,
				),
			{ message: /--max-chars must be between 80 and 500/ },
		);
	});
});
