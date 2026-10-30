/** Minimal typed JSON fetch for client components. Throws ApiError with the server message. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
  }
}

export async function api<T>(url: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  const res = await fetch(url, {
    ...rest,
    headers: { accept: "application/json", ...(json !== undefined ? { "content-type": "application/json" } : {}), ...headers },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
    credentials: "same-origin",
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string; code?: string; fieldErrors?: Record<string, string[]> };
  if (!res.ok) throw new ApiError(data.error ?? "Request failed", res.status, data.code, data.fieldErrors);
  return data;
}
