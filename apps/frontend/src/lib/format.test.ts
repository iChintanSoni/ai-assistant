import { describe, expect, test } from "vitest";
import { formatBytes, formatFullDateTime, formatMessageTime } from "./format";

describe("formatBytes", () => {
  test("returns empty string for zero/negative", () => {
    expect(formatBytes(0)).toBe("");
    expect(formatBytes(-5)).toBe("");
  });

  test("formats bytes/KB/MB", () => {
    expect(formatBytes(500)).toBe("500 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(1_500_000)).toBe("1.4 MB");
  });
});

describe("formatMessageTime", () => {
  const NOW = new Date("2026-07-14T12:00:00").getTime();

  test("same calendar day as now -> time only", () => {
    const morning = new Date("2026-07-14T09:05:00").getTime();
    expect(formatMessageTime(morning, NOW)).toBe(
      new Date(morning).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }),
    );
  });

  test("a different calendar day -> date + time, not just time", () => {
    const lateLastNight = new Date("2026-07-13T23:58:00").getTime();
    const label = formatMessageTime(lateLastNight, NOW);
    const time = new Date(lateLastNight).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    const date = new Date(lateLastNight).toLocaleDateString(undefined, { month: "short", day: "numeric" });
    expect(label).toBe(`${date}, ${time}`);
  });

  test("several days earlier -> date + time", () => {
    const then = new Date("2026-07-10T08:00:00").getTime();
    const label = formatMessageTime(then, NOW);
    const time = new Date(then).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    const date = new Date(then).toLocaleDateString(undefined, { month: "short", day: "numeric" });
    expect(label).toBe(`${date}, ${time}`);
  });
});

describe("formatFullDateTime", () => {
  test("includes weekday, full month, year, and seconds", () => {
    const ts = new Date("2026-07-14T10:32:15").getTime();
    expect(formatFullDateTime(ts)).toBe(
      new Date(ts).toLocaleString(undefined, {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
      }),
    );
  });
});
