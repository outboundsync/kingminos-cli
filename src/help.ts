import { BASE_URL_ENV, BYOK_PROVIDERS, DEFAULT_BASE_URL, TOKEN_ENV } from "./const";

export const ROOT_HELP = `King Minos CLI — KingMinos by OutboundSync

Usage:
  kingminos [--token <osr_…>] [--base-url <url>] <command>

Auth:
  Pass your tenant Bearer (osr_…) with --token or ${TOKEN_ENV}.
  There is no master ROUTER_API_KEY. This CLI never mints, stores, or logs a key.

API:
  Default ${DEFAULT_BASE_URL}
  Override with --base-url or ${BASE_URL_ENV}

Commands (live OpenAPI only):
  health                         GET  /health
  openapi                        GET  /openapi.yaml
  providers                      GET  /v1/providers
  capabilities                   GET  /v1/capabilities
  recipes                        GET  /v1/recipes
  company resolve                POST /v1/company/resolve
  company domain                 POST /v1/company/domain
  company hierarchy              POST /v1/company/hierarchy
  company b2b-social             POST /v1/company/b2b-social
  company icon                   POST /v1/company/icon
  company description            POST /v1/company/description
  person verify-employment       POST /v1/person/verify-employment
  person language                POST /v1/person/language
  person phone                   POST /v1/person/phone
  person title                   POST /v1/person/title
  runs get <id>                  GET  /v1/runs/{id}
  credentials put <provider>     PUT  /v1/credentials/{provider}
  credentials delete <provider>  DELETE /v1/credentials/{provider}
  subjects delete <subject_key>  DELETE /v1/subjects/{subject_key}
  batch <company|person> <cmd>   POST each JSONL/JSON-array row (requires --file --priority)

Your Keys providers: ${BYOK_PROVIDERS.join(", ")}
Websearch is house-only (no credentials command).
LeadMagic, Wiza, Findymail, and AI Ark are the approved house-key vendors. ZoomInfo, BuiltWith, Prospeo, Apollo, Company URL Finder, People Data Labs, HG Insights, Brandfetch, and Enrich-CRM stay BYOK.

HTTP errors exit non-zero. Responses print as received (pretty JSON when the body is JSON).

See kingminos <command> --help for request fields on that call.
`;

export function commandHelp(command: string): string {
	switch (command) {
		case "health":
			return `kingminos health

GET /health (no auth)
`;
		case "openapi":
			return `kingminos openapi

GET /openapi.yaml (no auth)
Prints the live OpenAPI document.
`;
		case "providers":
			return `kingminos providers

GET /v1/providers
Requires tenant Bearer (--token or ${TOKEN_ENV}).
`;
		case "capabilities":
			return `kingminos capabilities

GET /v1/capabilities
Requires tenant Bearer (--token or ${TOKEN_ENV}).
`;
		case "recipes":
			return `kingminos recipes

GET /v1/recipes
Requires tenant Bearer (--token or ${TOKEN_ENV}).
Machine-readable chaining workflows. Ask speed / balance / accuracy / coverage before a bulk run. Max yield = coverage.
`;
		case "batch":
			return `kingminos batch <company|person> <command> --file <path|-> --priority speed|balance|accuracy|coverage

Client-side loop over JSONL (or a JSON array) of request bodies. Not a bulk API.
Requires tenant Bearer (--token or ${TOKEN_ENV}).
Ask speed / balance / accuracy / coverage before a list run; --priority is required. Max yield = coverage.
`;
		case "company.resolve":
			return `kingminos company resolve

POST /v1/company/resolve
Requires tenant Bearer (--token or ${TOKEN_ENV}).

Body fields: --email --name --domain --website --dry-run --external-ref
             --path --preset --priority speed|balance|accuracy|coverage
             --routing <json> --compliance <json> --schema-version 2
             --body <json|@file|->
Headers:     --idempotency-key --explain default|full|minimal
             --schema 2 --max-provider-credits <n>
`;
		case "company.domain":
			return `kingminos company domain

POST /v1/company/domain
Requires tenant Bearer (--token or ${TOKEN_ENV}).

Body fields: --email --name --company-name --domain --website
             --city --state --country --postal-code --phone --linkedin-url
             --family-policy collapse_brand|separate_regional
             --path --preset --priority speed|balance|accuracy|coverage
             --skip-cache --dry-run --external-ref
             --routing <json> --compliance <json> --schema-version 2
             --body <json|@file|->
Headers:     --idempotency-key --explain default|full|minimal --schema 2
             --max-provider-credits <n> --cache bypass
             --cache-control no-cache|no-store
`;
		case "company.b2b_social":
			return `kingminos company b2b-social

POST /v1/company/b2b-social
Requires tenant Bearer (--token or ${TOKEN_ENV}).

Find the company's LinkedIn /company/{slug} page. Pass --domain (required).
--name is optional ranking only. --path speed is the bulk-list path
(homepage-first, then ranked search). Hits bill; misses are free.
Do not use company resolve for a LinkedIn page.

Body fields: --email --name --domain --website --linkedin-url
             --path --preset --priority speed|balance|accuracy|coverage
             --dry-run --external-ref
             --routing <json> --compliance <json>
             --body <json|@file|->
Headers:     --idempotency-key --explain default|full|minimal
             --schema 2 --max-provider-credits <n>
`;
		case "company.icon":
			return `kingminos company icon

POST /v1/company/icon
Requires tenant Bearer (--token or ${TOKEN_ENV}).

Body fields: --email --name --domain --website
             --dry-run --external-ref
             --compliance <json>
             --body <json|@file|->
Headers:     --idempotency-key --explain default|full|minimal
             --schema 2
`;
		case "company.description":
			return `kingminos company description

POST /v1/company/description
Requires tenant Bearer (--token or ${TOKEN_ENV}).

Body fields: --email --name --domain --website
             --path --preset --priority speed|balance|accuracy|coverage
             --dry-run --external-ref
             --routing <json> --compliance <json>
             --body <json|@file|->
Headers:     --idempotency-key --explain default|full|minimal
             --schema 2 --max-provider-credits <n>
`;
		case "company.hierarchy":
			return `kingminos company hierarchy

POST /v1/company/hierarchy
Requires tenant Bearer (--token or ${TOKEN_ENV}).

Body fields: --email --name --domain --website --country
             --path --preset --priority speed|balance|accuracy|coverage
             --dry-run --external-ref
             --routing <json> --compliance <json>
             --body <json|@file|->
Headers:     --idempotency-key --explain default|full|minimal
             --schema 2 --max-provider-credits <n>
`;
		case "person.verify_employment":
			return `kingminos person verify-employment

POST /v1/person/verify-employment
Requires tenant Bearer (--token or ${TOKEN_ENV}).

Body fields: --email --first-name --last-name --linkedin-url
             --expected-company <json>
             --expected-company-domain --expected-company-name
             --expected-company-website --priority speed|balance|accuracy|coverage
             --dry-run --external-ref --routing <json> --compliance <json>
             --body <json|@file|->
Headers:     --idempotency-key --explain default|full|minimal
             --schema 2 --max-provider-credits <n>
`;
		case "person.language":
			return `kingminos person language

POST /v1/person/language
Can we engage this person in English, and if not, in what language?
Requires tenant Bearer (--token or ${TOKEN_ENV}).

Body fields: --email | --linkedin-url (one required)
             --first-name --last-name (match-only: rejects a mismatched profile)
             --dry-run --external-ref --compliance <json>
             --body <json|@file|->
Headers:     --idempotency-key --explain default|full|minimal --schema 2
`;
		case "person.phone":
			return `kingminos person phone

POST /v1/person/phone
One dialable phone number for a person, plus the ranked rest.
Requires tenant Bearer (--token or ${TOKEN_ENV}).

Body fields: --email | --linkedin-url (one required)
             --first-name --last-name (match-only: rejects a mismatched profile)
             --phone-types mobile,landline,other,unknown (omit = any)
             --max-results <1-10> (default 3)
             --format e164|international|national|digits|digits_national
                      (fills \`number\`; default e164; every phone also has \`formats\`)
             --skip-cache --dry-run --external-ref --compliance <json>
             --body <json|@file|->
Headers:     --idempotency-key --explain default|full|minimal --schema 2
             --cache bypass --cache-control no-cache|no-store
`;
		case "person.title":
			return `kingminos person title

POST /v1/person/title
A person's current job title, seniority and function.
Requires tenant Bearer (--token or ${TOKEN_ENV}).

Body fields: --email | --linkedin-url (one required)
             --first-name --last-name (match-only: rejects a mismatched profile)
             --company-domain (match-only current employer)
             --fields title,seniority,function (omit = all three)
             --path speed|balance|accuracy|coverage (hit: 1 | 2 | 3 | 5 credits; miss 0)
             --priority speed|balance|accuracy|coverage
             --routing <json> (only / ignore)
             --skip-cache --dry-run --external-ref --compliance <json>
             --body <json|@file|->
Headers:     --idempotency-key --explain default|full|minimal --schema 2
             --cache bypass --cache-control no-cache|no-store
`;
		case "runs.get":
			return `kingminos runs get <id>

GET /v1/runs/{id}
Requires tenant Bearer (--token or ${TOKEN_ENV}).

Headers: --explain default|full|minimal --schema 2
`;
		case "credentials.put":
			return `kingminos credentials put <provider>

PUT /v1/credentials/{provider}
Requires tenant Bearer (--token or ${TOKEN_ENV}).
Providers: ${BYOK_PROVIDERS.join(", ")}
Websearch is house-only (byok_not_supported).

zoominfo:  --client-id --client-secret  → { clientId, clientSecret }
others:    --api-key                    → { apiKey }
or --body <json|@file|->  (api_key alias accepted by the API)

Responses never include the raw key. This CLI does not store or log it.
`;
		case "credentials.delete":
			return `kingminos credentials delete <provider>

DELETE /v1/credentials/{provider}
Requires tenant Bearer (--token or ${TOKEN_ENV}).
Providers: ${BYOK_PROVIDERS.join(", ")}
`;
		case "subjects.delete":
			return `kingminos subjects delete <subject_key>

DELETE /v1/subjects/{subject_key}
Requires tenant Bearer with erase scope (--token or ${TOKEN_ENV}).
Company: registrable domain. Person: email:<addr> or li:<slug>.
`;
		default:
			return ROOT_HELP;
	}
}
