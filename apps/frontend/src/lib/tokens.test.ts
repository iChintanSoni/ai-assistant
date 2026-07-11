import { expect, test } from "vitest";
import { formatTokens } from "./tokens";

test("returns the plain number below 1000", () => {
  expect(formatTokens(0)).toBe("0");
  expect(formatTokens(999)).toBe("999");
});

test("formats thousands with one decimal below 10K, none at/above 10K", () => {
  expect(formatTokens(1234)).toBe("1.2K");
  expect(formatTokens(12400)).toBe("12K");
});

test("formats millions with one decimal", () => {
  expect(formatTokens(1_500_000)).toBe("1.5M");
});
