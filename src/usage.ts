export class UsageError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "UsageError";
	}
}

export function assertNever(value: never, message?: string): never {
	throw new Error(message ?? `unexpected value: ${String(value)}`);
}
