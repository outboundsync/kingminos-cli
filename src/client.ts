export interface ApiRequest {
	fetch: typeof fetch;
	method: string;
	url: string;
	token?: string;
	headers?: Record<string, string>;
	body?: unknown;
}

export interface ApiResponse {
	status: number;
	contentType: string;
	text: string;
}

export async function apiRequest(input: ApiRequest): Promise<ApiResponse> {
	const headers = new Headers(input.headers);
	headers.set("x-kingminos-client", "cli");
	if (input.token) {
		headers.set("Authorization", `Bearer ${input.token}`);
	}
	let body: string | undefined;
	if (input.body !== undefined) {
		headers.set("content-type", "application/json");
		body = JSON.stringify(input.body);
	}
	const response = await input.fetch(input.url, {
		method: input.method,
		headers,
		body,
	});
	return {
		status: response.status,
		contentType: response.headers.get("content-type") ?? "",
		text: await response.text(),
	};
}

export function formatBody(text: string, contentType: string): string {
	const trimmed = text.replace(/^\uFEFF/, "");
	if (trimmed === "") {
		return "";
	}
	const jsonLike = contentType.includes("json") || looksLikeJson(trimmed);
	if (jsonLike) {
		try {
			return `${JSON.stringify(JSON.parse(trimmed), null, 2)}\n`;
		} catch {
			// keep the server text
		}
	}
	return trimmed.endsWith("\n") ? trimmed : `${trimmed}\n`;
}

function looksLikeJson(text: string): boolean {
	const start = text.trimStart()[0];
	return start === "{" || start === "[";
}
