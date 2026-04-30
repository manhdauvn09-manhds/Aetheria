import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  REFRESH_COOKIE,
  apiClient,
  buildClearRefreshCookie,
} from "@/lib/auth/proxy";

export async function POST(): Promise<NextResponse> {
  const jar = await cookies();
  const refresh = jar.get(REFRESH_COOKIE)?.value;
  // Best-effort revoke. Always 200 + clear cookie regardless of API response.
  if (refresh) {
    try {
      await apiClient().auth.logout.mutate({ refreshToken: refresh });
    } catch {
      // Already invalid / API down — clearing the cookie is the user-visible outcome.
    }
  }
  const out = NextResponse.json({ ok: true }, { status: 200 });
  out.headers.append("Set-Cookie", buildClearRefreshCookie());
  return out;
}
