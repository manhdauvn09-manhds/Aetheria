// Aetheria — browser-side auth helpers.
//
// Wraps fetch() against the Next /api/auth/* routes and propagates the
// API-shaped error JSON so forms can render `code` + `message` cleanly.

export interface ApiErrorBody {
  readonly code: string;
  readonly message: string;
  readonly details?: unknown;
}

export class AuthApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: ApiErrorBody,
  ) {
    super(body.message);
    this.name = "AuthApiError";
  }
}

export const postJSON = async <T,>(url: string, body: unknown): Promise<T> => {
  const init: RequestInit = {
    method: "POST",
    headers: { "content-type": "application/json" },
    // Cookies for the same-origin Next route. The refresh cookie is
    // httpOnly, so JS doesn't see it but it travels with the request.
    credentials: "same-origin",
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  const res = await fetch(url, init);
  let parsed: unknown = null;
  try {
    parsed = await res.json();
  } catch {
    // No body — leave parsed null.
  }
  if (!res.ok) {
    const body = (parsed ?? { code: "UNKNOWN", message: res.statusText }) as ApiErrorBody;
    throw new AuthApiError(res.status, body);
  }
  return parsed as T;
};
