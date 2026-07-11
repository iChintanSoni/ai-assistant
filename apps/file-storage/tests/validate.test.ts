import { expect, test } from "vitest";
import { detectAllowedMime } from "../src/validate.js";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
const PDF = Buffer.from("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n1 0 obj\n<< /Type /Catalog >>\nendobj\n");
const ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04, ...Array(26).fill(0)]);
const WAV = Buffer.concat([Buffer.from("RIFF", "ascii"), Buffer.from([0, 0, 0, 0]), Buffer.from("WAVE", "ascii"), Buffer.alloc(8)]);
const SVG = Buffer.from('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"></svg>');

test("accepts a real PNG regardless of the client-declared mimetype", async () => {
  await expect(detectAllowedMime(PNG, "application/octet-stream")).resolves.toBe("image/png");
});

test("accepts a real PDF", async () => {
  await expect(detectAllowedMime(PDF, "application/octet-stream")).resolves.toBe("application/pdf");
});

test("accepts a real WAV (audio/* is always allowed)", async () => {
  await expect(detectAllowedMime(WAV, "application/octet-stream")).resolves.toBe("audio/wav");
});

test("rejects a plain zip (not one of the allowed Office document mimes)", async () => {
  await expect(detectAllowedMime(ZIP, "application/zip")).resolves.toBeNull();
});

test("rejects SVG content even if the client claims image/svg+xml", async () => {
  await expect(detectAllowedMime(SVG, "image/svg+xml")).resolves.toBeNull();
});

test("trusts a text/* client mimetype only after verifying the bytes decode as UTF-8", async () => {
  const text = Buffer.from("hello world, this is plain text", "utf8");
  await expect(detectAllowedMime(text, "text/plain")).resolves.toBe("text/plain");
});

test("rejects text content when the client didn't claim a text/* mimetype", async () => {
  const text = Buffer.from("hello world", "utf8");
  await expect(detectAllowedMime(text, "application/octet-stream")).resolves.toBeNull();
});

test("rejects a text/* claim when the bytes contain a null byte (binary, not text)", async () => {
  const binary = Buffer.from([0x68, 0x69, 0x00, 0x68, 0x69]);
  await expect(detectAllowedMime(binary, "text/plain")).resolves.toBeNull();
});

test("rejects a text/* claim when the bytes aren't valid UTF-8", async () => {
  const invalidUtf8 = Buffer.from([0x80, 0x80, 0x80, 0x80]); // stray continuation bytes, no leading byte
  await expect(detectAllowedMime(invalidUtf8, "text/plain")).resolves.toBeNull();
});
