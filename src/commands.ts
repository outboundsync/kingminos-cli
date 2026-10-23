import { isByokProvider } from "./const";
import type { Command, FlagMap } from "./parse";
import { flagBool, flagString } from "./parse";
import { applyPriority, parsePriority } from "./priority";
import { assertNever, UsageError } from "./usage";

export interface BuiltRequest {
	method: string;
	path: string;
	headers: Record<string, string>;
	body?: unknown;
	auth: boolean;
}

export interface BodyLoader {
	readFile: (path: string) => string;
	stdin: string;
}

export function buildRequest(command: Command, flags: FlagMap, loader: BodyLoader): BuiltRequest {
	switch (command.name) {
		case "help":
			throw new UsageError("help is not an HTTP call");
		case "batch":
			throw new UsageError("batch is not a single HTTP call");
		case "health":
			return { method: "GET", path: "/health", headers: {}, auth: false };
		case "openapi":
			return { method: "GET", path: "/openapi.yaml", headers: {}, auth: false };
		case "providers":
			return { method: "GET", path: "/v1/providers", headers: {}, auth: true };
		case "capabilities":
			return { method: "GET", path: "/v1/capabilities", headers: {}, auth: true };
		case "recipes":
			return { method: "GET", path: "/v1/recipes", headers: {}, auth: true };
		case "company.resolve":
			return capabilityPost("/v1/company/resolve", resolveBody(flags, loader), flags);
		case "company.domain":
			return capabilityPost("/v1/company/domain", domainBody(flags, loader), flags, {
				cache: true,
			});
		case "company.hierarchy":
			return capabilityPost("/v1/company/hierarchy", hierarchyBody(flags, loader), flags);
		case "company.b2b_social":
			return capabilityPost("/v1/company/b2b-social", b2bSocialBody(flags, loader), flags);
		case "company.icon":
			return capabilityPost("/v1/company/icon", iconBody(flags, loader), flags);
		case "company.description":
			return capabilityPost("/v1/company/description", descriptionBody(flags, loader), flags, {
				cache: true,
			});
		case "person.verify_employment":
			return capabilityPost("/v1/person/verify-employment", employmentBody(flags, loader), flags);
		case "person.language":
			return capabilityPost("/v1/person/language", languageBody(flags, loader), flags);
		case "person.phone":
			return capabilityPost("/v1/person/phone", phoneBody(flags, loader), flags, {
				cache: true,
			});
		case "person.title":
			return capabilityPost("/v1/person/title", titleBody(flags, loader), flags, {
				cache: true,
			});
		case "person.b2b_social":
			return capabilityPost("/v1/person/b2b-social", personB2bSocialBody(flags, loader), flags, {
				cache: true,
			});
		case "runs.get":
			return {
				method: "GET",
				path: `/v1/runs/${encodeURIComponent(command.id)}`,
				headers: explainSchemaHeaders(flags),
				auth: true,
			};
		case "credentials.put":
			return {
				method: "PUT",
				path: `/v1/credentials/${encodeURIComponent(parseProvider(command.provider))}`,
				headers: {},
				body: credentialsPutBody(command.provider, flags, loader),
				auth: true,
			};
		case "credentials.delete":
			return {
				method: "DELETE",
				path: `/v1/credentials/${encodeURIComponent(parseProvider(command.provider))}`,
				headers: {},
				auth: true,
			};
		case "subjects.delete":
			return {
				method: "DELETE",
				path: `/v1/subjects/${encodeURIComponent(command.subjectKey)}`,
				headers: {},
				auth: true,
			};
		default:
			return assertNever(command);
	}
}

function capabilityPost(
	path: string,
	body: Record<string, unknown>,
	flags: FlagMap,
	options?: { cache?: boolean },
): BuiltRequest {
	return {
		method: "POST",
		path,
		headers: {
			...explainSchemaHeaders(flags),
			...optionalHeader("Idempotency-Key", flagString(flags, "idempotency-key")),
			...optionalHeader("X-Router-Max-Provider-Credits", flagString(flags, "max-provider-credits")),
			...(options?.cache
				? {
						...optionalHeader("X-Router-Cache", flagString(flags, "cache")),
						...optionalHeader("Cache-Control", flagString(flags, "cache-control")),
					}
				: {}),
		},
		body,
		auth: true,
	};
}

function explainSchemaHeaders(flags: FlagMap): Record<string, string> {
	return {
		...optionalHeader("X-Router-Explain", flagString(flags, "explain")),
		...optionalHeader("X-Router-Schema", flagString(flags, "schema")),
	};
}

function optionalHeader(name: string, value: string | undefined): Record<string, string> {
	return value === undefined ? {} : { [name]: value };
}

function resolveBody(flags: FlagMap, loader: BodyLoader): Record<string, unknown> {
	const body = baseBody(flags, loader);
	assignString(body, "email", flags);
	assignString(body, "name", flags);
	assignString(body, "domain", flags);
	assignString(body, "website", flags);
	assignCommon(body, flags);
	assignJson(body, "routing", flags);
	assignJson(body, "compliance", flags);
	assignString(body, "schema_version", flags, "schema-version");
	assignString(body, "path", flags);
	assignString(body, "preset", flags);
	return withPriority(body, flags, "company.resolve");
}

function domainBody(flags: FlagMap, loader: BodyLoader): Record<string, unknown> {
	const body = baseBody(flags, loader);
	assignString(body, "email", flags);
	assignString(body, "name", flags);
	assignString(body, "company_name", flags, "company-name");
	assignString(body, "domain", flags);
	assignString(body, "website", flags);
	assignString(body, "city", flags);
	assignString(body, "state", flags);
	assignString(body, "country", flags);
	assignString(body, "postal_code", flags, "postal-code");
	assignString(body, "phone", flags);
	assignString(body, "linkedin_url", flags, "linkedin-url");
	assignString(body, "family_policy", flags, "family-policy");
	assignString(body, "path", flags);
	assignString(body, "preset", flags);
	if (flagBool(flags, "skip-cache")) {
		body.skip_cache = true;
	}
	assignCommon(body, flags);
	assignJson(body, "routing", flags);
	assignJson(body, "compliance", flags);
	assignString(body, "schema_version", flags, "schema-version");
	return withPriority(body, flags, "company.domain");
}

function b2bSocialBody(flags: FlagMap, loader: BodyLoader): Record<string, unknown> {
	const body = baseBody(flags, loader);
	assignString(body, "email", flags);
	assignString(body, "name", flags);
	assignString(body, "domain", flags);
	assignString(body, "website", flags);
	assignString(body, "linkedin_url", flags, "linkedin-url");
	assignString(body, "hint", flags);
	assignString(body, "country", flags);
	assignString(body, "path", flags);
	assignString(body, "preset", flags);
	assignCommon(body, flags);
	assignJson(body, "routing", flags);
	assignJson(body, "compliance", flags);
	return withPriority(body, flags, "company.b2b_social");
}

function iconBody(flags: FlagMap, loader: BodyLoader): Record<string, unknown> {
	const body = baseBody(flags, loader);
	assignString(body, "email", flags);
	assignString(body, "name", flags);
	assignString(body, "domain", flags);
	assignString(body, "website", flags);
	assignCommon(body, flags);
	assignJson(body, "compliance", flags);
	return body;
}

function descriptionBody(flags: FlagMap, loader: BodyLoader): Record<string, unknown> {
	const body = baseBody(flags, loader);
	assignString(body, "email", flags);
	assignString(body, "name", flags);
	assignString(body, "domain", flags);
	assignString(body, "website", flags);
	assignString(body, "path", flags);
	assignString(body, "preset", flags);
	assignInteger(body, "max_chars", flags, "max-chars", 80, 500);
	if (flagBool(flags, "skip-cache")) {
		body.skip_cache = true;
	}
	assignCommon(body, flags);
	assignJson(body, "routing", flags);
	assignJson(body, "compliance", flags);
	return withPriority(body, flags, "company.description");
}

function hierarchyBody(flags: FlagMap, loader: BodyLoader): Record<string, unknown> {
	const body = baseBody(flags, loader);
	assignString(body, "email", flags);
	assignString(body, "name", flags);
	assignString(body, "domain", flags);
	assignString(body, "website", flags);
	assignString(body, "country", flags);
	assignString(body, "path", flags);
	assignString(body, "preset", flags);
	assignCommon(body, flags);
	assignJson(body, "routing", flags);
	assignJson(body, "compliance", flags);
	return withPriority(body, flags, "company.hierarchy");
}

function employmentBody(flags: FlagMap, loader: BodyLoader): Record<string, unknown> {
	const body = baseBody(flags, loader);
	assignString(body, "email", flags);
	assignString(body, "first_name", flags, "first-name");
	assignString(body, "last_name", flags, "last-name");
	assignString(body, "linkedin_url", flags, "linkedin-url");
	const expected = expectedCompany(flags);
	if (expected) {
		body.expected_company = expected;
	}
	assignCommon(body, flags);
	assignJson(body, "routing", flags);
	assignJson(body, "compliance", flags);
	return withPriority(body, flags, "person.verify_employment");
}

function languageBody(flags: FlagMap, loader: BodyLoader): Record<string, unknown> {
	const body = baseBody(flags, loader);
	assignString(body, "email", flags);
	assignString(body, "linkedin_url", flags, "linkedin-url");
	assignString(body, "first_name", flags, "first-name");
	assignString(body, "last_name", flags, "last-name");
	if (flagBool(flags, "skip-cache")) {
		body.skip_cache = true;
	}
	assignCommon(body, flags);
	assignJson(body, "compliance", flags);
	return withPriority(body, flags, "person.language");
}

function phoneBody(flags: FlagMap, loader: BodyLoader): Record<string, unknown> {
	const body = baseBody(flags, loader);
	assignString(body, "email", flags);
	assignString(body, "linkedin_url", flags, "linkedin-url");
	assignString(body, "first_name", flags, "first-name");
	assignString(body, "last_name", flags, "last-name");
	assignString(body, "domain", flags);
	const phoneTypes = flagString(flags, "phone-types");
	if (phoneTypes !== undefined) {
		const types = phoneTypes
			.split(",")
			.map((type: string) => type.trim())
			.filter(Boolean);
		if (types.length > 0) {
			body.phone_types = types;
		}
	}
	const maxResults = Number(flagString(flags, "max-results"));
	if (Number.isInteger(maxResults) && maxResults >= 1) {
		body.max_results = maxResults;
	}
	// e164 | international | national | digits | digits_national (server validates).
	assignString(body, "format", flags);
	if (flagBool(flags, "skip-cache")) {
		body.skip_cache = true;
	}
	assignCommon(body, flags);
	assignJson(body, "compliance", flags);
	return withPriority(body, flags, "person.phone");
}

function titleBody(flags: FlagMap, loader: BodyLoader): Record<string, unknown> {
	const body = baseBody(flags, loader);
	assignString(body, "email", flags);
	assignString(body, "linkedin_url", flags, "linkedin-url");
	assignString(body, "first_name", flags, "first-name");
	assignString(body, "last_name", flags, "last-name");
	assignString(body, "company_domain", flags, "company-domain");
	const fields = flagString(flags, "fields");
	if (fields !== undefined) {
		const list = fields
			.split(",")
			.map((field: string) => field.trim())
			.filter(Boolean);
		if (list.length > 0) {
			body.fields = list;
		}
	}
	if (flagBool(flags, "skip-cache")) {
		body.skip_cache = true;
	}
	assignCommon(body, flags);
	assignRouting(body, flags);
	assignJson(body, "compliance", flags);
	return withPriority(body, flags, "person.title");
}

function personB2bSocialBody(flags: FlagMap, loader: BodyLoader): Record<string, unknown> {
	const body = baseBody(flags, loader);
	assignString(body, "email", flags);
	assignString(body, "linkedin_url", flags, "linkedin-url");
	assignString(body, "first_name", flags, "first-name");
	assignString(body, "last_name", flags, "last-name");
	if (flagBool(flags, "skip-cache")) {
		body.skip_cache = true;
	}
	assignCommon(body, flags);
	assignRouting(body, flags);
	assignJson(body, "compliance", flags);
	return withPriority(body, flags, "person.b2b_social");
}

/** `--routing <json>` plus `--path`, for capabilities that read the path from `routing` only. */
function assignRouting(body: Record<string, unknown>, flags: FlagMap): void {
	assignJson(body, "routing", flags);
	const path = flagString(flags, "path");
	if (path !== undefined) {
		const routing =
			body.routing && typeof body.routing === "object" && !Array.isArray(body.routing)
				? (body.routing as Record<string, unknown>)
				: {};
		body.routing = { ...routing, path };
	}
}

function expectedCompany(flags: FlagMap): Record<string, unknown> | undefined {
	const fromJson = parseJsonFlag(flags, "expected-company");
	const company: Record<string, unknown> = fromJson ? { ...fromJson } : {};
	const domain = flagString(flags, "expected-company-domain");
	const name = flagString(flags, "expected-company-name");
	const website = flagString(flags, "expected-company-website");
	if (domain !== undefined) {
		company.domain = domain;
	}
	if (name !== undefined) {
		company.name = name;
	}
	if (website !== undefined) {
		company.website = website;
	}
	return Object.keys(company).length > 0 ? company : undefined;
}

function withPriority(
	body: Record<string, unknown>,
	flags: FlagMap,
	capability: string,
): Record<string, unknown> {
	const raw = flagString(flags, "priority");
	if (raw === undefined) {
		return body;
	}
	return applyPriority(body, parsePriority(raw), capability);
}

function assignCommon(body: Record<string, unknown>, flags: FlagMap): void {
	if (flagBool(flags, "dry-run")) {
		body.dry_run = true;
	}
	assignString(body, "external_ref", flags, "external-ref");
}

function assignString(
	body: Record<string, unknown>,
	field: string,
	flags: FlagMap,
	flagName = field.replaceAll("_", "-"),
): void {
	const value = flagString(flags, flagName);
	if (value !== undefined) {
		body[field] = value;
	}
}

function assignInteger(
	body: Record<string, unknown>,
	field: string,
	flags: FlagMap,
	flagName: string,
	min: number,
	max: number,
): void {
	const raw = flagString(flags, flagName);
	if (raw === undefined) {
		return;
	}
	const value = Number(raw);
	if (!Number.isInteger(value)) {
		throw new UsageError(`--${flagName} must be an integer`);
	}
	if (value < min || value > max) {
		throw new UsageError(`--${flagName} must be between ${min} and ${max}`);
	}
	body[field] = value;
}

function assignJson(body: Record<string, unknown>, field: string, flags: FlagMap): void {
	const parsed = parseJsonFlag(flags, field);
	if (parsed) {
		body[field] = parsed;
	}
}

function parseJsonFlag(flags: FlagMap, name: string): Record<string, unknown> | undefined {
	const raw = flagString(flags, name);
	if (raw === undefined) {
		return undefined;
	}
	return parseObjectJson(raw, `--${name}`);
}

function baseBody(flags: FlagMap, loader: BodyLoader): Record<string, unknown> {
	const raw = flagString(flags, "body");
	if (raw === undefined) {
		return {};
	}
	return { ...loadBodyObject(raw, loader) };
}

function loadBodyObject(raw: string, loader: BodyLoader): Record<string, unknown> {
	if (raw === "-") {
		return parseObjectJson(loader.stdin, "--body -");
	}
	if (raw.startsWith("@")) {
		const path = raw.slice(1);
		if (!path) {
			throw new UsageError("--body @file requires a path");
		}
		return parseObjectJson(loader.readFile(path), `--body @${path}`);
	}
	return parseObjectJson(raw, "--body");
}

function parseObjectJson(raw: string, label: string): Record<string, unknown> {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		throw new UsageError(`${label} is not valid JSON`);
	}
	if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
		throw new UsageError(`${label} must be a JSON object`);
	}
	return parsed as Record<string, unknown>;
}

function parseProvider(provider: string): string {
	if (provider === "websearch") {
		throw new UsageError("websearch is house-only (byok_not_supported)");
	}
	if (!isByokProvider(provider)) {
		throw new UsageError(`unknown_provider: ${provider}`);
	}
	return provider;
}

function credentialsPutBody(provider: string, flags: FlagMap, loader: BodyLoader): unknown {
	const rawBody = flagString(flags, "body");
	const fromFile = rawBody ? loadBodyObject(rawBody, loader) : undefined;
	if (provider === "zoominfo") {
		const clientId = flagString(flags, "client-id") ?? stringField(fromFile, "clientId");
		const clientSecret =
			flagString(flags, "client-secret") ?? stringField(fromFile, "clientSecret");
		if (!clientId || !clientSecret) {
			throw new UsageError(
				"credentials put zoominfo requires --client-id and --client-secret (or --body { clientId, clientSecret })",
			);
		}
		return { clientId, clientSecret };
	}
	if (
		fromFile &&
		flagString(flags, "api-key") === undefined &&
		(stringField(fromFile, "apiKey") || stringField(fromFile, "api_key"))
	) {
		return fromFile;
	}
	const apiKey =
		flagString(flags, "api-key") ??
		stringField(fromFile, "apiKey") ??
		stringField(fromFile, "api_key");
	if (!apiKey) {
		throw new UsageError(`credentials put ${provider} requires --api-key (or --body { apiKey })`);
	}
	return { apiKey };
}

function stringField(body: Record<string, unknown> | undefined, key: string): string | undefined {
	const value = body?.[key];
	return typeof value === "string" && value !== "" ? value : undefined;
}
