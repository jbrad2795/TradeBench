#!/usr/bin/env node
// Local preview only. The site is plain static files and needs no server to
// work - this exists so it can be reviewed at a real http:// origin before it
// goes anywhere. Node stdlib, no deps, serves site/ and nothing above it.
//
//   node site/serve.mjs        ->  http://localhost:4174

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, extname, normalize, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 4174;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jsonl": "application/x-ndjson; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (p.endsWith("/")) p += "index.html";
    // normalize then confirm the result is still inside ROOT - no traversal out
    const file = normalize(join(ROOT, p));
    if (!file.startsWith(ROOT)) {
      res.writeHead(403).end("forbidden");
      return;
    }
    const s = await stat(file);
    if (s.isDirectory()) {
      res.writeHead(302, { Location: p.replace(/\/?$/, "/") + "index.html" }).end();
      return;
    }
    const body = await readFile(file);
    res.writeHead(200, {
      "content-type": TYPES[extname(file).toLowerCase()] || "application/octet-stream",
      "cache-control": "no-cache",
    }).end(body);
  } catch {
    res.writeHead(404, { "content-type": "text/plain" }).end("not found");
  }
}).listen(PORT, () => console.log(`site  ->  http://localhost:${PORT}`));
