import { UsageError } from "./usage";

export const PRIORITIES = ["speed", "balance", "accuracy", "coverage"] as const;
export type Priority = (typeof PRIORITIES)[number];

const PRIORITY_HELP =
	"Before a bulk run, ask which path: speed, balance, accuracy, or coverage. Re-run with --priority speed|balance|accuracy|coverage. Max yield = coverage. company.resolve value is the one-step lookup, not a tier.";

export function parsePriority(value: string): Priority {
	switch (value) {
		case "speed":
		case "balance":
		case "accuracy":
		case "coverage":
			return value;
		default:
			throw new UsageError(PRIORITY_HELP);
	}
}

/** `--priority` is the routing path. `value` is not a tier. */
export function pathForPriority(priority: Priority): string {
	return priority;
}

export function applyPriority(
	body: Record<string, unknown>,
	priority: Priority,
	_capability?: string,
): Record<string, unknown> {
	const path = pathForPriority(priority);
	const routing =
		body.routing && typeof body.routing === "object" && !Array.isArray(body.routing)
			? (body.routing as Record<string, unknown>)
			: {};
	return { ...body, routing: { ...routing, path } };
}

/** Human extras from live response fields only — never invent prices. */
export function formatDecisionNotes(body: unknown): string {
	if (!body || typeof body !== "object" || Array.isArray(body)) {
		return "";
	}
	const record = body as {
		answer?: { confidence?: unknown };
		usage?: { credits?: { spent?: unknown } };
	};
	const lines: string[] = [];
	const confidence = record.answer?.confidence;
	if (confidence === "high" || confidence === "medium" || confidence === "low") {
		lines.push(`Confidence: ${confidence}`);
	} else if (confidence === null) {
		lines.push("Confidence: none");
	}
	const spent = record.usage?.credits?.spent;
	if (typeof spent === "number") {
		lines.push(`Credits spent: ${spent}`);
	}
	return lines.length > 0 ? `\n${lines.join("\n")}\n` : "";
}

export function formatNextStepsHints(body: unknown): string {
	if (!body || typeof body !== "object" || Array.isArray(body)) {
		return "";
	}
	const steps = (body as { next_steps?: unknown }).next_steps;
	if (!Array.isArray(steps) || steps.length === 0) {
		return "";
	}
	const lines = ["", "Next:"];
	for (const raw of steps) {
		if (!raw || typeof raw !== "object") {
			continue;
		}
		const step = raw as {
			action?: string;
			capability?: string;
			reason?: string;
			est_credits?: number | null;
			suggested?: unknown;
		};
		const credits = typeof step.est_credits === "number" ? ` (~${step.est_credits} credits)` : "";
		const stepRecord = step as { endpoint?: string };
		const target = step.capability
			? ` ${step.capability}`
			: stepRecord.endpoint
				? ` ${stepRecord.endpoint}`
				: "";
		lines.push(`- ${step.action ?? "next"}${target}${credits}: ${step.reason ?? ""}`.trim());
		if (step.suggested && typeof step.suggested === "object") {
			lines.push(`  suggested: ${JSON.stringify(step.suggested)}`);
		}
	}
	return `${lines.join("\n")}\n`;
}

export function formatQualityFlagsWarning(body: unknown): string {
	if (!body || typeof body !== "object" || Array.isArray(body)) {
		return "";
	}
	const result = (body as { result?: { quality_flags?: unknown } }).result;
	const flags = result?.quality_flags;
	if (!Array.isArray(flags) || flags.length === 0) {
		return "";
	}
	const labels = flags.filter((flag): flag is string => typeof flag === "string");
	if (labels.length === 0) {
		return "";
	}
	return `\nWarning: quality_flags (${labels.join(", ")}). Do not write this name — follow Next: steps.\n`;
}

export function formatOptionsHints(body: unknown): string {
	if (!body || typeof body !== "object" || Array.isArray(body)) {
		return "";
	}
	const options = (body as { options?: unknown }).options;
	if (!Array.isArray(options) || options.length === 0) {
		return "";
	}
	const lines = ["", "Options (present to the user; do not pick a cheaper default):"];
	for (const raw of options) {
		if (!raw || typeof raw !== "object") {
			continue;
		}
		const option = raw as {
			endpoint?: string;
			path?: string;
			description?: string;
			est_credits?: number;
		};
		const path =
			option.path === "speed" ||
			option.path === "balance" ||
			option.path === "accuracy" ||
			option.path === "coverage"
				? ` [${option.path}]`
				: "";
		const credits = typeof option.est_credits === "number" ? ` ~${option.est_credits} credits` : "";
		const headline = `${option.endpoint ?? "endpoint"}${path}${credits}`;
		const detail = option.description ? `: ${option.description}` : "";
		lines.push(`- ${headline}${detail}`);
	}
	return `${lines.join("\n")}\n`;
}

export function formatAgentGuidance(body: unknown): string {
	if (!body || typeof body !== "object" || Array.isArray(body)) {
		return "";
	}
	const guidance = (body as { agent_guidance?: unknown }).agent_guidance;
	if (typeof guidance !== "string") {
		return "";
	}
	const trimmed = guidance.trim();
	if (!trimmed) {
		return "";
	}
	return `\nAgent: ${trimmed}\n`;
}

/** Human follow-ups after the JSON body (omitted with --json). */
export function formatHumanResponseExtras(body: unknown): string {
	return (
		formatDecisionNotes(body) +
		formatQualityFlagsWarning(body) +
		formatOptionsHints(body) +
		formatAgentGuidance(body) +
		formatNextStepsHints(body)
	);
}
