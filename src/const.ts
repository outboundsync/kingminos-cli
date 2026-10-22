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

export const BOOLEAN_FLAGS = new Set(["help", "h", "dry-run", "skip-cache"]);

export const GLOBAL_FLAGS = new Set(["token", "base-url", "help", "h"]);
