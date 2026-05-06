import { describe, expect, it } from "vitest";

import { redactEmail } from "../redact.js";

describe("redactEmail", () => {
  it("masks local part, preserves domain", () => {
    expect(redactEmail("alice@example.com")).toBe("a***@example.com");
    expect(redactEmail("bob@aetheria.gg")).toBe("b***@aetheria.gg");
  });

  it("returns ***@domain for short local parts (≤ 2 chars)", () => {
    expect(redactEmail("ab@example.com")).toBe("***@example.com");
    expect(redactEmail("a@example.com")).toBe("***@example.com");
  });

  it("returns *** for malformed input", () => {
    expect(redactEmail("")).toBe("***");
    expect(redactEmail("noatsign")).toBe("***");
    expect(redactEmail("@nolocal.com")).toBe("***");
    expect(redactEmail("nodomain@")).toBe("***");
  });

  it("handles emails with subdomain + plus addressing", () => {
    expect(redactEmail("alice+tag@mail.example.com")).toBe("a***@mail.example.com");
  });
});
