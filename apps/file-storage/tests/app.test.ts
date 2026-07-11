import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "vitest";
import request from "supertest";
import { config } from "../src/config.js";
import { listFiles } from "../src/store.js";
import { buildApp } from "../src/app.js";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
const ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04, ...Array(26).fill(0)]);

// Written before buildApp() runs, so backfillExistingFiles() has a chance to adopt it.
const storageDir = path.resolve(process.cwd(), config.storageDir);
mkdirSync(storageDir, { recursive: true });
writeFileSync(path.join(storageDir, "raw-existing.png"), PNG);

const app = await buildApp();

test("GET /health returns 200 OK", async () => {
  const res = await request(app).get("/health");
  expect(res.status).toBe(200);
  expect(res.text).toBe("OK");
});

test("backfillExistingFiles adopts a pre-existing on-disk file that had no DB row", async () => {
  const res = await request(app).get("/files/raw-existing.png");
  expect(res.status).toBe(200);
  expect(res.headers["content-type"]).toMatch(/image\/png/);
});

test("POST /upload accepts a real PNG and makes it servable via GET /files/:filename", async () => {
  const uploadRes = await request(app).post("/upload").attach("file", PNG, "photo.png");

  expect(uploadRes.status).toBe(201);
  expect(uploadRes.body.mimetype).toBe("image/png");
  expect(uploadRes.body.url).toBe(`${config.baseUrl}/files/${uploadRes.body.filename}`);

  const getRes = await request(app).get(`/files/${uploadRes.body.filename}`);
  expect(getRes.status).toBe(200);
  expect(getRes.headers["content-type"]).toMatch(/image\/png/);
  expect(getRes.headers["content-disposition"]).toContain("photo.png");
});

test("POST /upload rejects when no file field is sent", async () => {
  const res = await request(app).post("/upload");
  expect(res.status).toBe(400);
});

test("POST /upload rejects disallowed content with 415 and doesn't leave a DB row behind", async () => {
  const before = listFiles().length;

  const res = await request(app).post("/upload").attach("file", ZIP, "archive.zip");

  expect(res.status).toBe(415);
  expect(listFiles().length).toBe(before);
});

test("GET /files/:filename returns 404 for an unknown filename", async () => {
  const res = await request(app).get("/files/does-not-exist.png");
  expect(res.status).toBe(404);
});

test("GET /files lists uploaded file metadata", async () => {
  await request(app).post("/upload").attach("file", PNG, "listed.png");
  const res = await request(app).get("/files");
  expect(res.body.files.some((f: { originalName: string }) => f.originalName === "listed.png")).toBe(true);
});

test("DELETE /files/:filename removes the file, and a subsequent GET 404s", async () => {
  const uploadRes = await request(app).post("/upload").attach("file", PNG, "to-delete.png");

  const del = await request(app).delete(`/files/${uploadRes.body.filename}`);
  expect(del.status).toBe(204);

  const getRes = await request(app).get(`/files/${uploadRes.body.filename}`);
  expect(getRes.status).toBe(404);
});

test("DELETE /files/:filename returns 404 for an unknown filename", async () => {
  const res = await request(app).delete("/files/does-not-exist.png");
  expect(res.status).toBe(404);
});
