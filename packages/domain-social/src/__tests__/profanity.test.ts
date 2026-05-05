import { describe, expect, it } from "vitest";

import {
  containsProfanity,
  DEFAULT_PROFANITY,
  normalizeForMatch,
  redactProfanity,
} from "../profanity.js";

describe("normalizeForMatch", () => {
  it("lower-cases + folds leet substitutions", () => {
    expect(normalizeForMatch("Sh1T")).toBe("shit");
    expect(normalizeForMatch("@SShole")).toBe("asshole");
    expect(normalizeForMatch("F$ck")).toBe("fsck"); // $→s only, leaves c
  });
});

describe("containsProfanity", () => {
  it("matches whole-word hits, even with leet", () => {
    expect(containsProfanity("hello shit world")).toBe(true);
    expect(containsProfanity("oh sh1t")).toBe(true);
    expect(containsProfanity("FUCK!")).toBe(true);
  });

  it("ignores benign substrings", () => {
    expect(containsProfanity("scunthorpe is a town")).toBe(false);
    expect(containsProfanity("badwording is not in list")).toBe(false);
  });

  it("respects a custom list", () => {
    expect(containsProfanity("avocado", ["avocado"])).toBe(true);
    expect(containsProfanity("apple", ["avocado"])).toBe(false);
  });

  it("ships a non-empty default list", () => {
    expect(DEFAULT_PROFANITY.length).toBeGreaterThan(0);
  });
});

describe("redactProfanity", () => {
  it("replaces matches with `*` of equal length, preserving outside text", () => {
    expect(redactProfanity("hello shit world")).toBe("hello **** world");
  });

  it("preserves unrelated punctuation", () => {
    expect(redactProfanity("oh, fuck!")).toBe("oh, ****!");
  });

  it("returns input unchanged when clean", () => {
    expect(redactProfanity("good morning")).toBe("good morning");
  });
});
