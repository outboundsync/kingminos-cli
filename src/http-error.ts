import { EXIT, type ExitCode } from "./const";

export interface ClassifiedHttpError {
	exitCode: ExitCode;
	message: string;
}

export function classifyHttpError(status: number, body: unknown): ClassifiedHttpError {
	const extra = errorSuffix(body);
	if (status === 401) {
		return {
			exitCode: EXIT.unauthorized,
			message: `Unauthorized (401)${authDetail(body)}. Set KINGMINOS_API_KEY or pass --token.${extra}`,
		};
	}
	if (status === 402) {
		return {
			exitCode: EXIT.payment,
			message: `Out of credits (402). Add credits at https://app.kingminos.com.${extra}`,
		};
	}
	if (status === 429) {
		const budget = isBudgetError(body);
		return {
			exitCode: EXIT.rateLimited,
			message: budget
				? `Out of credits or daily key budget (429). Retry after Retry-After, or add credits.${extra}`
				: `Rate limited (429). Retry after the Retry-After header.${extra}`,
		};
	}
	if (status >= 500) {
		return {
			exitCode: EXIT.server,
			message: `KingMinos server error (${status}). Retry the same Idempotency-Key if you sent one.${extra}`,
		};
	}
	return {
		exitCode: EXIT.http,
		message: `HTTP ${status}${extra}`,
	};
}

function authDetail(body: unknown): string {
	const detail = stringField(body, "detail");
	switch (detail) {
		case "missing":
			return ": missing Bearer token";
		case "malformed":
			return ": malformed Bearer token (send `Authorization: Bearer <key>`, not a bare key)";
		case "mismatch":
			return ": API key did not match";
		case undefined:
			return ": missing, malformed, or mismatched API key";
		default:
			return `: ${detail}`;
	}
}

function isBudgetError(body: unknown): boolean {
	const error = stringField(body, "error") ?? "";
	return (
		error === "key_budget_exhausted" ||
		error === "tenant_budget_exhausted" ||
		error.includes("budget") ||
		error.includes("credit")
	);
}

function errorSuffix(body: unknown): string {
	const error = stringField(body, "error");
	const hint = stringField(body, "hint");
	const parts = [error, hint].filter((part): part is string => Boolean(part));
	return parts.length > 0 ? ` ${parts.join(" — ")}` : "";
}

function stringField(body: unknown, key: string): string | undefined {
	if (!body || typeof body !== "object" || Array.isArray(body)) {
		return undefined;
	}
	const value = (body as Record<string, unknown>)[key];
	return typeof value === "string" && value !== "" ? value : undefined;
}
