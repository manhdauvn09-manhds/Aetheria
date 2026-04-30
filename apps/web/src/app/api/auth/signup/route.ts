import { NextResponse } from "next/server";
import { z } from "zod";

import {
  apiClient,
  buildRefreshCookie,
  proxyErrorFor,
  sessionResponseFromTrpc,
} from "@/lib/auth/proxy";

const inputSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(10).max(128),
  displayName: z.string().min(2).max(32),
});

export async function POST(req: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { code: "VALIDATION_FAILED", message: "Invalid JSON body" },
      { status: 400 },
    );
  }
  const parsed = inputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { code: "VALIDATION_FAILED", message: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const res = await apiClient().auth.signupWithEmail.mutate(parsed.data);
    const session = sessionResponseFromTrpc(res);
    const out = NextResponse.json(session, { status: 200 });
    out.headers.append(
      "Set-Cookie",
      buildRefreshCookie(res.tokens.refreshToken, {
        expiresAt: res.tokens.refreshTokenExpiresAt,
      }),
    );
    return out;
  } catch (e) {
    const err = proxyErrorFor(e);
    return NextResponse.json(err.body, { status: err.status });
  }
}
