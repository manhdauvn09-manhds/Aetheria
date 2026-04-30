import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  REFRESH_COOKIE,
  apiClient,
  buildRefreshCookie,
  proxyErrorFor,
  sessionResponseFromTrpc,
} from "@/lib/auth/proxy";

export async function POST(): Promise<NextResponse> {
  const jar = await cookies();
  const refresh = jar.get(REFRESH_COOKIE)?.value;
  if (!refresh) {
    return NextResponse.json(
      { code: "UNAUTHENTICATED", message: "No refresh cookie" },
      { status: 401 },
    );
  }
  try {
    const res = await apiClient().auth.refreshToken.mutate({ refreshToken: refresh });
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
