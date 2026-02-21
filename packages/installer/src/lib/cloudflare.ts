const CF_API = "https://api.cloudflare.com/client/v4";

type CfResponse<T> = {
	success: boolean;
	errors: Array<{ code: number; message: string }>;
	result: T;
};

function authHeaders({ token }: { token: string }): Record<string, string> {
	return {
		Authorization: `Bearer ${token}`,
		"Content-Type": "application/json",
	};
}

async function cfFetch<T>({
	path,
	token,
	method = "GET",
	body,
}: {
	path: string;
	token: string;
	method?: string;
	body?: unknown;
}): Promise<CfResponse<T>> {
	const res = await fetch(`${CF_API}${path}`, {
		method,
		headers: authHeaders({ token }),
		body: body ? JSON.stringify(body) : undefined,
	});
	return (await res.json()) as CfResponse<T>;
}

async function cfFetchRaw({
	path,
	token,
	method = "PUT",
	body,
}: {
	path: string;
	token: string;
	method?: string;
	body: BodyInit;
}): Promise<Response> {
	return fetch(`${CF_API}${path}`, {
		method,
		headers: { Authorization: `Bearer ${token}` },
		body,
	});
}

export { cfFetch, cfFetchRaw };
export type { CfResponse };
