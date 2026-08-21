// Static web server for the observation room, plus a streaming run endpoint.
// The API key stays server-side and is never sent to the browser.

import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

import { packIndex } from "./public/scenarios/index.js";
import { listModels } from "./lib/models.js";
import { ARMS } from "./lib/arms.js";
import { runNegotiation } from "./lib/engine.js";
import { isLive, modelName } from "./lib/model.js";

const root = fileURLToPath(new URL("./public/", import.meta.url));
const port = Number(process.env.PORT || 4173);

const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
};

function send(res, status, body, type = "application/json; charset=utf-8") {
  res.writeHead(status, { "content-type": type, "cache-control": "no-store" });
  res.end(type.startsWith("application/json") ? JSON.stringify(body) : body);
}

/**
 * Server-sent events: a negotiation takes minutes, so the room streams turns as
 * they land rather than waiting for the whole run.
 */
async function streamRun(req, res, url) {
  res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-store",
    connection: "keep-alive",
  });

  const emit = (event, data) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  let cancelled = false;
  req.on("close", () => { cancelled = true; });

  try {
    const result = await runNegotiation({
      packId: url.searchParams.get("scenario") || undefined,
      condition: { dispositionArm: url.searchParams.get("arm") || "control" },
      model: url.searchParams.get("model") || undefined,
      variant: url.searchParams.get("variant") || undefined,
      repeat: 1,
      onEvent: (e) => {
        if (cancelled) return;
        // Seat objects carry the full brief; send only what the room renders.
        const seat = e.seat
          ? { id: e.seat.id, label: e.seat.label, country: e.seat.country, countryName: e.seat.countryName, level: e.seat.level }
          : undefined;
        emit(e.type, { ...e, seat });
      },
    });
    emit("done", result);
  } catch (error) {
    emit("failed", { message: error.message });
  }
  res.end();
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${port}`);

    if (req.method === "GET" && url.pathname === "/api/status") {
      return send(res, 200, { live: isLive(), model: modelName() });
    }
    if (req.method === "GET" && url.pathname === "/api/arms") {
      return send(res, 200, {
        arms: Object.entries(ARMS).map(([key, a]) => ({ key, label: a.label, description: a.description })),
      });
    }
    if (req.method === "GET" && url.pathname === "/api/models") {
      return send(res, 200, { models: listModels() });
    }
    if (req.method === "GET" && url.pathname === "/api/scenarios") {
      return send(res, 200, { scenarios: packIndex() });
    }
    if (req.method === "GET" && url.pathname === "/api/run") {
      return streamRun(req, res, url);
    }
    if (req.method !== "GET") return send(res, 405, { error: "Method not allowed" });

    const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
    const target = normalize(join(root, pathname));
    if (!target.startsWith(root)) return send(res, 403, { error: "Forbidden" });
    const file = await readFile(target);
    return send(res, 200, file, mime[extname(target)] || "application/octet-stream");
  } catch (error) {
    if (error.code === "ENOENT") return send(res, 404, { error: "Not found" });
    console.error(error);
    return send(res, 500, { error: error.message || "Server error" });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`TradeBench observation room: http://localhost:${port}`);
  console.log(isLive() ? `Live mode (${modelName()})` : "Offline mode - stub responses, no API calls");
});
