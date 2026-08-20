// A single exclusive run lock.
//
// Two negotiations must never run at once: it wastes tokens, and if the two use
// different models the logs stop being comparable as discrete runs. The lock is
// a file holding the owning pid, so a crashed run does not block the next one -
// a lock whose process is gone is treated as stale and taken over.

import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const defaultDir = fileURLToPath(new URL("../runs/", import.meta.url));
const lockPath = () => join(process.env.TB_RUNS_DIR || defaultDir, ".run-lock");

const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM means it exists but belongs to someone else - still alive.
    return error.code === "EPERM";
  }
};

export function acquireRunLock({ model, scenario }) {
  const path = lockPath();
  mkdirSync(join(path, ".."), { recursive: true });

  if (existsSync(path)) {
    let held;
    try {
      held = JSON.parse(readFileSync(path, "utf8"));
    } catch {
      held = null;
    }
    if (held && held.pid && alive(held.pid)) {
      throw new Error(
        `A run is already in progress (pid ${held.pid}, ${held.model || "unknown model"}, ` +
          `started ${held.started}). Only one run at a time - wait for it to finish, or stop it.`,
      );
    }
    // Stale lock from a crashed run; take it over.
    try { unlinkSync(path); } catch { /* raced with another cleanup */ }
  }

  writeFileSync(
    path,
    JSON.stringify({ pid: process.pid, model, scenario, started: new Date().toISOString() }),
    "utf8",
  );

  return function release() {
    try {
      const held = JSON.parse(readFileSync(path, "utf8"));
      if (held.pid === process.pid) unlinkSync(path);
    } catch { /* already gone */ }
  };
}
