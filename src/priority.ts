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
		const target = step.capability ? ` ${step.capability}` : "";
		lines.push(`- ${step.action ?? "next"}${target}${credits}: ${step.reason ?? ""}`.trim());
		if (step.suggested && typeof step.suggested === "object") {
			lines.push(`  suggested: ${JSON.stringify(step.suggested)}`);
		}
	}
	return `${lines.join("\n")}\n`;
}
