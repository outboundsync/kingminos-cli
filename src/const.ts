export const DEFAULT_BASE_URL = "https://api.kingminos.com";
export const TOKEN_ENV = "KINGMINOS_API_KEY";
export const BASE_URL_ENV = "KINGMINOS_BASE_URL";

export const BYOK_PROVIDERS = [
	"zoominfo",
	"leadmagic",
	"findymail",
	"wiza",
	"aiark",
	"builtwith",
	"prospeo",
	"apollo",
	"companyurlfinder",
	"peopledatalabs",
	"hginsights",
	"brandfetch",
	"enrichcrm",
	"lemlist",
	"snovio",
	"cognism",
	"lusha",
	"starbridge",
	"clay",
	"databar",
	"quickenrich",
	"getleads",
	"blitzapi",
] as const;

export type ByokProvider = (typeof BYOK_PROVIDERS)[number];

export function isByokProvider(value: string): value is ByokProvider {
	return (BYOK_PROVIDERS as readonly string[]).includes(value);
}

export const BOOLEAN_FLAGS = new Set(["help", "h", "dry-run", "skip-cache", "json"]);

export const GLOBAL_FLAGS = new Set(["token", "base-url", "help", "h", "json"]);

/** Process exit codes. HTTP classes are distinct so scripts can branch. */
export const EXIT = {
	ok: 0,
	usage: 1,
	unauthorized: 2,
	payment: 3,
	rateLimited: 4,
	server: 5,
	http: 6,
} as const;

export type ExitCode = (typeof EXIT)[keyof typeof EXIT];
