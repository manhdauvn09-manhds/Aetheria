import { describe, it, expect } from "vitest";

import {
  defaultTokenTtl,
  issueTokenPair,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  type TokenConfig,
} from "../tokens.js";

const cfg: TokenConfig = {
  accessSecret:      "access-secret-32-bytes-aetheria!",
  refreshSecret:     "refresh-secret-32-bytes-aetheria!",
  issuer:            "aetheria-test",
  audience:          "aetheria-app",
  accessTtlSeconds:  15 * 60,
  refreshTtlSeconds: 30 * 24 * 60 * 60,
};

const UID = 42n;

interface JwtPayload {
  sub?:   string;
  roles?: string[];
  iss?:   string;
  aud?:   string;
  jti?:   string;
  iat?:   number;
  exp?:   number;
}

const decodePayload = (token: string): JwtPayload =>
  JSON.parse(Buffer.from(token.split(".")[1]!, "base64url").toString()) as JwtPayload;

// ── signAccessToken ───────────────────────────────────────────────────────

describe("signAccessToken", () => {
  it("returns a non-empty JWT string and a future expiresAt", async () => {
    const before = Date.now();
    const { token, expiresAt } = await signAccessToken(UID, ["player"], cfg);
    expect(typeof token).toBe("string");
    expect(token.split(".")).toHaveLength(3);
    expect(expiresAt).toBeGreaterThan(before);
  });

  it("encodes userId as 'sub' claim", async () => {
    const { token } = await signAccessToken(UID, ["player"], cfg);
    const payload = decodePayload(token);
    expect(payload.sub).toBe(UID.toString());
  });

  it("embeds roles in the payload", async () => {
    const { token } = await signAccessToken(UID, ["player", "admin"], cfg);
    const payload = decodePayload(token);
    expect(payload.roles).toEqual(["player", "admin"]);
  });

  it("sets issuer and audience", async () => {
    const { token } = await signAccessToken(UID, [], cfg);
    const payload = decodePayload(token);
    expect(payload.iss).toBe("aetheria-test");
    expect(payload.aud).toBe("aetheria-app");
  });
});

// ── signRefreshToken ──────────────────────────────────────────────────────

describe("signRefreshToken", () => {
  it("returns token, jti (uuid format), and future expiresAt", async () => {
    const { token, jti, expiresAt } = await signRefreshToken(UID, cfg);
    expect(typeof token).toBe("string");
    expect(jti).toMatch(/^[0-9a-f-]{36}$/);
    expect(expiresAt).toBeGreaterThan(Date.now());
  });

  it("embeds jti in the token payload", async () => {
    const { token, jti } = await signRefreshToken(UID, cfg);
    const payload = decodePayload(token);
    expect(payload.jti).toBe(jti);
  });

  it("two calls produce different jtis", async () => {
    const a = await signRefreshToken(UID, cfg);
    const b = await signRefreshToken(UID, cfg);
    expect(a.jti).not.toBe(b.jti);
  });
});

// ── issueTokenPair ────────────────────────────────────────────────────────

describe("issueTokenPair", () => {
  it("returns both access and refresh tokens plus refresh jti", async () => {
    const result = await issueTokenPair(UID, ["player"], cfg);
    expect(result.accessToken).toBeTruthy();
    expect(result.refreshToken).toBeTruthy();
    expect(result.refreshJti).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.accessTokenExpiresAt).toBeGreaterThan(Date.now());
    expect(result.refreshTokenExpiresAt).toBeGreaterThan(Date.now());
  });

  it("access token expires before refresh token", async () => {
    const result = await issueTokenPair(UID, [], cfg);
    expect(result.refreshTokenExpiresAt).toBeGreaterThan(result.accessTokenExpiresAt);
  });
});

// ── verifyRefreshToken ────────────────────────────────────────────────────

describe("verifyRefreshToken", () => {
  it("returns userId, jti, and expiresAt for a valid token", async () => {
    const { token, jti } = await signRefreshToken(UID, cfg);
    const result = await verifyRefreshToken(token, cfg);
    expect(result.userId).toBe(UID);
    expect(result.jti).toBe(jti);
    expect(result.expiresAt).toBeGreaterThan(Date.now());
  });

  it("throws unauthenticated on bad signature (wrong secret)", async () => {
    const { token } = await signRefreshToken(UID, cfg);
    const wrongCfg = { ...cfg, refreshSecret: "totally-wrong-secret-xxxxxxxxxxx!" };
    await expect(verifyRefreshToken(token, wrongCfg)).rejects.toThrow();
  });

  it("throws unauthenticated on a tampered payload", async () => {
    const { token } = await signRefreshToken(UID, cfg);
    const parts = token.split(".");
    // Flip one byte in the payload.
    const payload = Buffer.from(parts[1]!, "base64url");
    payload[0] = payload[0]! ^ 0xff;
    const tampered = `${parts[0]}.${payload.toString("base64url")}.${parts[2]}`;
    await expect(verifyRefreshToken(tampered, cfg)).rejects.toThrow();
  });

  it("throws unauthenticated for an expired token", async () => {
    const expiredCfg: TokenConfig = { ...cfg, refreshTtlSeconds: -1 };
    const { token } = await signRefreshToken(UID, expiredCfg);
    await expect(verifyRefreshToken(token, cfg)).rejects.toThrow();
  });

  it("throws when access token is passed instead of refresh token", async () => {
    const { token } = await signAccessToken(UID, [], cfg);
    // Access token is signed with accessSecret — verifying against refreshSecret fails.
    await expect(verifyRefreshToken(token, cfg)).rejects.toThrow();
  });
});

// ── defaultTokenTtl ───────────────────────────────────────────────────────

describe("defaultTokenTtl", () => {
  it("access TTL is 15 min", () => {
    expect(defaultTokenTtl.accessTtlSeconds).toBe(900);
  });

  it("refresh TTL is 30 d", () => {
    expect(defaultTokenTtl.refreshTtlSeconds).toBe(30 * 24 * 60 * 60);
  });
});
