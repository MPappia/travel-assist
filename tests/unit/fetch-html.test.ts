import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { gzipSync } from "node:zlib";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { parseLinkPreview } from "@/lib/link-preview/parse";
import { BROWSER_USER_AGENT, fetchHtml, FetchHtmlError } from "@/server/link-preview/fetch-html";

let server: Server;
let base: string;
let lastUserAgent: string | undefined;

beforeAll(async () => {
  server = createServer((req, res) => {
    lastUserAgent = req.headers["user-agent"];
    switch (req.url) {
      case "/listing":
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(`<head><meta property="og:title" content="Villa Sintra"><meta property="og:image" content="/v.jpg"></head>`);
        break;
      case "/gzip":
        res.writeHead(200, { "content-type": "text/html", "content-encoding": "gzip" });
        res.end(gzipSync(`<head><title>Compressé</title></head>`));
        break;
      case "/latin1":
        res.writeHead(200, { "content-type": "text/html; charset=iso-8859-1" });
        res.end(Buffer.from(`<head><title>Gîte à Évora</title></head>`, "latin1"));
        break;
      case "/redirect":
        res.writeHead(302, { location: "/listing" });
        res.end();
        break;
      case "/loop":
        res.writeHead(302, { location: "/loop" });
        res.end();
        break;
      case "/redirect-file":
        res.writeHead(302, { location: "file:///etc/passwd" });
        res.end();
        break;
      case "/forbidden":
        res.writeHead(403, { "content-type": "text/html" });
        res.end("Access denied");
        break;
      case "/json":
        res.writeHead(200, { "content-type": "application/json" });
        res.end("{}");
        break;
      case "/huge":
        res.writeHead(200, { "content-type": "text/html" });
        res.write(`<head><title>Énorme</title></head>`);
        res.end("x".repeat(3_000_000));
        break;
      case "/slow":
        setTimeout(() => res.end("<title>trop tard</title>"), 2000);
        break;
      default:
        res.writeHead(404);
        res.end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

const local = { allowPrivateNetwork: true };

async function expectError(promise: Promise<unknown>, code: FetchHtmlError["code"]) {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(FetchHtmlError);
  expect((error as FetchHtmlError).code).toBe(code);
  return error as FetchHtmlError;
}

describe("fetchHtml", () => {
  it("refuse par défaut les adresses locales (SSRF)", async () => {
    await expectError(fetchHtml(`${base}/listing`), "UNSAFE_URL");
  });

  it("télécharge une page et envoie un User-Agent de navigateur", async () => {
    const result = await fetchHtml(`${base}/listing`, local);
    expect(parseLinkPreview(result.html, result.finalUrl)).toMatchObject({
      title: "Villa Sintra",
      image: `${base}/v.jpg`,
    });
    expect(lastUserAgent).toBe(BROWSER_USER_AGENT);
  });

  it("suit les redirections et décompresse gzip", async () => {
    const redirected = await fetchHtml(`${base}/redirect`, local);
    expect(redirected.finalUrl).toBe(`${base}/listing`);
    const gz = await fetchHtml(`${base}/gzip`, local);
    expect(gz.html).toContain("Compressé");
  });

  it("respecte l'encodage annoncé", async () => {
    const result = await fetchHtml(`${base}/latin1`, local);
    expect(result.html).toContain("Gîte à Évora");
  });

  it("revalide les redirections et limite leur nombre", async () => {
    await expectError(fetchHtml(`${base}/redirect-file`, local), "UNSAFE_URL");
    await expectError(fetchHtml(`${base}/loop`, local), "TOO_MANY_REDIRECTS");
  });

  it("signale les refus et les contenus non HTML", async () => {
    const error = await expectError(fetchHtml(`${base}/forbidden`, local), "HTTP_ERROR");
    expect(error.message).toContain("403");
    await expectError(fetchHtml(`${base}/json`, local), "NOT_HTML");
  });

  it("plafonne la taille lue", async () => {
    const result = await fetchHtml(`${base}/huge`, { ...local, maxBytes: 100_000 });
    expect(result.truncated).toBe(true);
    expect(result.html.length).toBeLessThanOrEqual(100_000);
    expect(result.html).toContain("Énorme");
  });

  it("abandonne après le délai", async () => {
    await expectError(fetchHtml(`${base}/slow`, { ...local, timeoutMs: 300 }), "TIMEOUT");
  });
});
