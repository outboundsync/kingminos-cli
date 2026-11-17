import type { Command } from "./parse";
import { PRIORITIES } from "./priority";

/**
 * The command reference: every command's usage, summary, route and flags.
 * `COMMAND_FLAGS` (the per-command flag allowlist in parse.ts) is derived from
 * it, and `commands.json` is generated from it (`npm run commands:json`).
 * test/reference.test.ts checks each entry against buildRequest (method, path,
 * auth) and against its `--help` text (usage line and every flag).
 */
export interface FlagRef {
	name: string;
	help: string;
	/** The command fails with a usage error without this flag. */
	required?: boolean;
	values?: readonly string[];
}

export interface CommandRef {
	id: Exclude<Command["name"], "help">;
	usage: string;
	summary: string;
	method: "GET" | "POST" | "PUT" | "DELETE";
	/** OpenAPI path. batch posts each row to the capability's own route. */
	path: string;
	/** Changes stored data (keys, subjects). Capability lookups are not writes. */
	write: boolean;
	/** Needs a tenant Bearer. */
	auth: boolean;
	flags: readonly FlagRef[];
}

const CONFIDENCE = ["high", "medium", "low"] as const;
const THREE_PATHS = ["speed", "balance", "accuracy"] as const;

function flag(name: string, help: string, extra: Omit<FlagRef, "name" | "help"> = {}): FlagRef {
	return { name, help, ...extra };
}

const BODY = flag("body", "Request body as JSON, @file, or - for stdin. Other flags set fields on top of it.");
const DRY_RUN = flag("dry-run", "Offline and instant: no vendor calls.");
const EXTERNAL_REF = flag("external-ref", "Your correlation key, returned on the run.");
const MIN_CONFIDENCE = flag("min-confidence", "Lowest confidence to accept. Omit for the path's floor.", {
	values: CONFIDENCE,
});
const ROUTING = flag("routing", "Routing options as a JSON object.");
const PERSON_ROUTING = flag("routing", "Routing options as a JSON object (only / ignore).");
const COMPLIANCE = flag("compliance", "Compliance requirements as a JSON object (soc2, data).");
const SCHEMA_VERSION = flag("schema-version", "Request schema version.", { values: ["2"] });
const SKIP_CACHE = flag("skip-cache", "Skip the 30-day cache read. The fresh answer is still written.");
const PRESET = flag("preset", "Back-compat alias of --path.");
const HEADERS: readonly FlagRef[] = [
	flag("idempotency-key", "Sent as the Idempotency-Key header."),
	flag("explain", "Sent as the X-Router-Explain header.", { values: ["default", "full", "minimal"] }),
	flag("schema", "Sent as the X-Router-Schema header.", { values: ["2"] }),
];
const MAX_PROVIDER_CREDITS = flag(
	"max-provider-credits",
	"Cap on provider credits, sent as the X-Router-Max-Provider-Credits header.",
);
const CACHE_HEADERS: readonly FlagRef[] = [
	flag("cache", "Sent as the X-Router-Cache header.", { values: ["bypass"] }),
	flag("cache-control", "Sent as the Cache-Control header.", { values: ["no-cache", "no-store"] }),
];

function priority(values: readonly string[] = PRIORITIES): FlagRef {
	return flag("priority", "Tier, sent as routing.path. Ask which before a bulk run; max yield is coverage.", {
		values,
	});
}

function path(help: string, values?: readonly string[]): FlagRef {
	return flag("path", help, values ? { values } : {});
}

const COMPANY_PATH = path("Routing path (speed, balance, accuracy, coverage).");
const PERSON_PATH = path("Routing path, sent as routing.path.", PRIORITIES);

// Company subject fields.
const COMPANY_EMAIL = flag("email", "An email address at the company.");
const COMPANY_NAME = flag("name", "Company name.");
const COMPANY_DOMAIN = flag("domain", "Company domain.");
const COMPANY_WEBSITE = flag("website", "Company website URL.");
const COMPANY_SUBJECT = [COMPANY_EMAIL, COMPANY_NAME, COMPANY_DOMAIN, COMPANY_WEBSITE];
const NAME_COUNTRY = flag("country", "ISO country, to disambiguate a company name.");
const HINT = flag("hint", 'List or industry context for name-to-domain, e.g. "UK PR agency".');

// Person subject fields.
const PERSON_EMAIL = flag("email", "The person's email address. Pass this or --linkedin-url.");
const PERSON_LINKEDIN = flag("linkedin-url", "The person's LinkedIn profile URL. Pass this or --email.");
const MATCH_FIRST = flag("first-name", "Match-only: rejects a profile that belongs to someone else.");
const MATCH_LAST = flag("last-name", "Match-only: rejects a profile that belongs to someone else.");

/** Flags shared by the person capabilities after their subject fields. */
function personTail(options: { cache: boolean; maxCredits?: boolean }): FlagRef[] {
	return [
		PERSON_PATH,
		PERSON_ROUTING,
		...(options.cache ? [SKIP_CACHE] : []),
		DRY_RUN,
		EXTERNAL_REF,
		MIN_CONFIDENCE,
		COMPLIANCE,
		...HEADERS,
		...(options.cache ? CACHE_HEADERS : []),
		priority(),
		...(options.maxCredits ? [MAX_PROVIDER_CREDITS] : []),
	];
}

export const COMMAND_REFS: readonly CommandRef[] = [
	{
		id: "health",
		usage: "kingminos health",
		summary: "Check that the API is up. No API key needed.",
		method: "GET",
		path: "/health",
		write: false,
		auth: false,
		flags: [],
	},
	{
		id: "openapi",
		usage: "kingminos openapi",
		summary: "Print the live OpenAPI document. No API key needed.",
		method: "GET",
		path: "/openapi.yaml",
		write: false,
		auth: false,
		flags: [],
	},
	{
		id: "pricing",
		usage: "kingminos pricing",
		summary: "Show the public pricing table: credits per delivered answer for each capability path. No API key needed.",
		method: "GET",
		path: "/v1/pricing",
		write: false,
		auth: false,
		flags: [flag("json", "Print the API response as JSON (with plans and BYOK fees) instead of the table.")],
	},
	{
		id: "providers",
		usage: "kingminos providers",
		summary: "List the provider registry, with billing modes and credit estimates.",
		method: "GET",
		path: "/v1/providers",
		write: false,
		auth: true,
		flags: [],
	},
	{
		id: "capabilities",
		usage: "kingminos capabilities",
		summary: "List the capability catalog: inputs, outputs, hops and default routing.",
		method: "GET",
		path: "/v1/capabilities",
		write: false,
		auth: true,
		flags: [],
	},
	{
		id: "recipes",
		usage: "kingminos recipes",
		summary: "Print machine-readable chaining workflows for agents.",
		method: "GET",
		path: "/v1/recipes",
		write: false,
		auth: true,
		flags: [],
	},
	{
		id: "recipes.guidance",
		usage: "kingminos recipes guidance",
		summary: "Print how to use an answer: confidence levels, path floors, next steps and billing. No API key needed.",
		method: "GET",
		path: "/v1/recipes/guidance",
		write: false,
		auth: false,
		flags: [],
	},
	{
		id: "company.resolve",
		usage: "kingminos company resolve",
		summary: "Resolve a company from an email, domain or website.",
		method: "POST",
		path: "/v1/company/resolve",
		write: false,
		auth: true,
		flags: [
			BODY,
			...COMPANY_SUBJECT,
			DRY_RUN,
			EXTERNAL_REF,
			MIN_CONFIDENCE,
			ROUTING,
			COMPLIANCE,
			SCHEMA_VERSION,
			...HEADERS,
			priority(),
			path("Routing path, sent as routing.path."),
			flag("preset", "Back-compat alias of --path, sent as routing.preset."),
			MAX_PROVIDER_CREDITS,
		],
	},
	{
		id: "company.domain",
		usage: "kingminos company domain",
		summary: "Decide the company's CRM domain and whether it is safe to write.",
		method: "POST",
		path: "/v1/company/domain",
		write: false,
		auth: true,
		flags: [
			BODY,
			COMPANY_EMAIL,
			COMPANY_NAME,
			flag("company-name", "Alias of --name."),
			COMPANY_DOMAIN,
			COMPANY_WEBSITE,
			flag("city", "Company city."),
			flag("state", "Company state or region."),
			flag("country", "Company country."),
			flag("postal-code", "Company postal code."),
			flag("phone", "Company phone number."),
			flag("linkedin-url", "Company LinkedIn page URL (linkedin.com/company/...)."),
			flag("family-policy", "How alias and regional domains map to the CRM shape. Default collapse_brand.", {
				values: ["collapse_brand", "separate_regional"],
			}),
			COMPANY_PATH,
			PRESET,
			SKIP_CACHE,
			DRY_RUN,
			EXTERNAL_REF,
			MIN_CONFIDENCE,
			ROUTING,
			COMPLIANCE,
			SCHEMA_VERSION,
			...HEADERS,
			...CACHE_HEADERS,
			priority(),
			MAX_PROVIDER_CREDITS,
		],
	},
	{
		id: "company.hierarchy",
		usage: "kingminos company hierarchy",
		summary: "Decide the corporate family: immediate and ultimate parent, and subsidiaries.",
		method: "POST",
		path: "/v1/company/hierarchy",
		write: false,
		auth: true,
		flags: [
			BODY,
			...COMPANY_SUBJECT,
			flag("country", "Company country."),
			path("Routing path (speed, balance, accuracy; coverage is invalid_routing)."),
			PRESET,
			DRY_RUN,
			EXTERNAL_REF,
			ROUTING,
			COMPLIANCE,
			...HEADERS,
			priority(THREE_PATHS),
			MAX_PROVIDER_CREDITS,
		],
	},
	{
		id: "company.b2b_social",
		usage: "kingminos company b2b-social",
		summary: "Decide the company's own B2B social page URL, or null.",
		method: "POST",
		path: "/v1/company/b2b-social",
		write: false,
		auth: true,
		flags: [
			BODY,
			...COMPANY_SUBJECT,
			flag("linkedin-url", "Company page URL to agree-check (linkedin.com/company/...)."),
			HINT,
			NAME_COUNTRY,
			COMPANY_PATH,
			PRESET,
			DRY_RUN,
			EXTERNAL_REF,
			MIN_CONFIDENCE,
			ROUTING,
			COMPLIANCE,
			...HEADERS,
			priority(),
			MAX_PROVIDER_CREDITS,
		],
	},
	{
		id: "company.icon",
		usage: "kingminos company icon",
		summary: "Decide the company's hosted icon URL, or null.",
		method: "POST",
		path: "/v1/company/icon",
		write: false,
		auth: true,
		flags: [BODY, ...COMPANY_SUBJECT, DRY_RUN, EXTERNAL_REF, MIN_CONFIDENCE, COMPLIANCE, ...HEADERS],
	},
	{
		id: "company.description",
		usage: "kingminos company description",
		summary: "Decide a usable English company description, or null.",
		method: "POST",
		path: "/v1/company/description",
		write: false,
		auth: true,
		flags: [
			BODY,
			...COMPANY_SUBJECT,
			COMPANY_PATH,
			PRESET,
			flag("max-chars", "Truncate at a sentence boundary, 80 to 500 characters."),
			SKIP_CACHE,
			DRY_RUN,
			EXTERNAL_REF,
			MIN_CONFIDENCE,
			ROUTING,
			COMPLIANCE,
			...HEADERS,
			...CACHE_HEADERS,
			priority(),
			MAX_PROVIDER_CREDITS,
		],
	},
	{
		id: "company.x_account",
		usage: "kingminos company x-account",
		summary: "Decide the company's own X account URL, or null.",
		method: "POST",
		path: "/v1/company/x-account",
		write: false,
		auth: true,
		flags: [
			BODY,
			...COMPANY_SUBJECT,
			flag("x-url", "Account URL to agree-check (https://x.com/{handle}). Not a lookup input."),
			HINT,
			NAME_COUNTRY,
			COMPANY_PATH,
			PRESET,
			DRY_RUN,
			EXTERNAL_REF,
			MIN_CONFIDENCE,
			ROUTING,
			COMPLIANCE,
			...HEADERS,
			priority(),
			MAX_PROVIDER_CREDITS,
		],
	},
	{
		id: "person.verify_employment",
		usage: "kingminos person verify-employment",
		summary: "Verify whether to send to this person: are they still at the company?",
		method: "POST",
		path: "/v1/person/verify-employment",
		write: false,
		auth: true,
		flags: [
			BODY,
			flag("email", "The person's email address."),
			flag("first-name", "The person's first name."),
			flag("last-name", "The person's last name."),
			flag("linkedin-url", "The person's LinkedIn profile URL. Preferred for the job-change check."),
			flag("expected-company", "Expected employer as a JSON object."),
			flag("expected-company-domain", "Expected employer domain."),
			flag("expected-company-name", "Expected employer name."),
			flag("expected-company-website", "Expected employer website."),
			DRY_RUN,
			EXTERNAL_REF,
			ROUTING,
			COMPLIANCE,
			...HEADERS,
			priority(THREE_PATHS),
			MAX_PROVIDER_CREDITS,
		],
	},
	{
		id: "person.language",
		usage: "kingminos person language",
		summary: "Can we engage this person in English, and if not, in what language?",
		method: "POST",
		path: "/v1/person/language",
		write: false,
		auth: true,
		flags: [
			BODY,
			PERSON_EMAIL,
			MATCH_FIRST,
			MATCH_LAST,
			PERSON_LINKEDIN,
			path("Routing path, sent as routing.path.", THREE_PATHS),
			ROUTING,
			SKIP_CACHE,
			...CACHE_HEADERS,
			DRY_RUN,
			EXTERNAL_REF,
			MIN_CONFIDENCE,
			COMPLIANCE,
			...HEADERS,
			priority(THREE_PATHS),
		],
	},
	{
		id: "person.phone",
		usage: "kingminos person phone",
		summary: "One dialable phone number for a person, plus the ranked rest.",
		method: "POST",
		path: "/v1/person/phone",
		write: false,
		auth: true,
		flags: [
			BODY,
			PERSON_EMAIL,
			MATCH_FIRST,
			MATCH_LAST,
			PERSON_LINKEDIN,
			flag("domain", "Company domain."),
			flag("phone-types", "Comma-separated: mobile, landline, other, unknown. Omit for any type."),
			flag("max-results", "Ranked-list size, 1 to 10. Default 3."),
			flag("format", "Format that fills `number`. Default e164; every phone also has `formats`.", {
				values: ["e164", "international", "national", "digits", "digits_national"],
			}),
			...personTail({ cache: true }),
		],
	},
	{
		id: "person.title",
		usage: "kingminos person title",
		summary: "A person's current job title, seniority and function.",
		method: "POST",
		path: "/v1/person/title",
		write: false,
		auth: true,
		flags: [
			BODY,
			PERSON_EMAIL,
			MATCH_FIRST,
			MATCH_LAST,
			PERSON_LINKEDIN,
			flag("company-domain", "Match-only current employer."),
			flag("fields", "Comma-separated: title, seniority, function. Omit for all three."),
			...personTail({ cache: true, maxCredits: true }),
		],
	},
	{
		id: "person.name",
		usage: "kingminos person name",
		summary: "A person's proper-cased first, last and full name.",
		method: "POST",
		path: "/v1/person/name",
		write: false,
		auth: true,
		flags: [
			BODY,
			PERSON_EMAIL,
			PERSON_LINKEDIN,
			flag("phone", "Accepted, never looked up."),
			flag("x-handle", "Accepted, never looked up."),
			flag("last-name-fallback", "Fills result.last_name when no last name is found."),
			flag("output", "Output options as a JSON object (salesforce_safe)."),
			...personTail({ cache: true, maxCredits: true }),
		],
	},
	{
		id: "person.b2b_social",
		usage: "kingminos person b2b-social",
		summary: "A person's B2B social profile URL from their email.",
		method: "POST",
		path: "/v1/person/b2b-social",
		write: false,
		auth: true,
		flags: [
			BODY,
			flag("email", "The person's email address. Required unless --body sets it."),
			MATCH_FIRST,
			MATCH_LAST,
			flag("linkedin-url", "Match-only: a resolved profile with another slug is rejected."),
			flag("company-domain", "Match-only employer."),
			...personTail({ cache: true, maxCredits: true }),
		],
	},
	{
		id: "person.email",
		usage: "kingminos person email",
		summary: "A person's verified work email, from a name and company domain or a LinkedIn URL.",
		method: "POST",
		path: "/v1/person/email",
		write: false,
		auth: true,
		flags: [
			BODY,
			flag("first-name", "First name, for the name route (with --last-name and --company-domain)."),
			flag("last-name", "Last name, for the name route."),
			flag("company-domain", "Company domain, for the name route."),
			flag("linkedin-url", "The person's LinkedIn profile URL (the LinkedIn route)."),
			...personTail({ cache: true, maxCredits: true }),
		],
	},
	{
		id: "email.verify",
		usage: "kingminos email verify",
		summary: "Is this mailbox deliverable? valid, invalid, catch_all or unknown.",
		method: "POST",
		path: "/v1/email/verify",
		write: false,
		auth: true,
		flags: [
			BODY,
			flag("email", "The mailbox to check. Required unless --body sets it."),
			...personTail({ cache: false, maxCredits: true }),
		],
	},
	{
		id: "runs.get",
		usage: "kingminos runs get <id>",
		summary: "Fetch a recorded run.",
		method: "GET",
		path: "/v1/runs/{id}",
		write: false,
		auth: true,
		flags: [...HEADERS.filter((ref) => ref.name !== "idempotency-key")],
	},
	{
		id: "credentials.put",
		usage: "kingminos credentials put <provider>",
		summary: "Store your own key for a provider (Your Keys). The key is checked with the vendor first.",
		method: "PUT",
		path: "/v1/credentials/{provider}",
		write: true,
		auth: true,
		flags: [
			BODY,
			flag("api-key", "The provider API key (every provider except zoominfo and snovio)."),
			flag("client-id", "OAuth client id (zoominfo, snovio)."),
			flag("client-secret", "OAuth client secret (zoominfo, snovio)."),
		],
	},
	{
		id: "credentials.delete",
		usage: "kingminos credentials delete <provider>",
		summary: "Revoke your stored key for a provider.",
		method: "DELETE",
		path: "/v1/credentials/{provider}",
		write: true,
		auth: true,
		flags: [],
	},
	{
		id: "subjects.delete",
		usage: "kingminos subjects delete <subject_key>",
		summary: "Erase a subject (company domain, email:<addr> or li:<slug>). Needs the erase scope.",
		method: "DELETE",
		path: "/v1/subjects/{subject_key}",
		write: true,
		auth: true,
		flags: [],
	},
	{
		id: "batch",
		usage:
			"kingminos batch <company|person|email> <command> --file <path|-> --priority speed|balance|accuracy|coverage",
		summary: "Post each row of a JSONL file or JSON array to a capability, one call per row. Not a bulk API.",
		method: "POST",
		path: "/v1/{group}/{command}",
		write: false,
		auth: true,
		flags: [
			flag("file", "JSONL or a JSON array of request bodies, or - for stdin.", { required: true }),
			flag("priority", "Tier for every row, sent as routing.path. Ask which before a list run.", {
				required: true,
				values: PRIORITIES,
			}),
			...HEADERS.filter((ref) => ref.name !== "idempotency-key"),
			flag("dry-run", "No effect: rows are sent as written. Set dry_run in a row instead."),
			flag("path", "No effect: --priority sets routing.path on every row."),
		],
	},
];
