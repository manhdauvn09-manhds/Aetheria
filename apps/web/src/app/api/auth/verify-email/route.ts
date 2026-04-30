import { NextResponse } from "next/server";
import { z } from "zod";

import { apiClient, proxyErrorFor } from "@/lib/auth/proxy";

const inputSchema = z.object({
  token: z.string().min(20).max(256),
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
    await apiClient().auth.confirmEmailVerification.mutate(parsed.data);
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e) {
    const err = proxyErrorFor(e);
    return NextResponse.json(err.body, { status: err.status });
  }
}
