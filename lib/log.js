// One JSONL file per run. Every line is a self-describing event with a monotonic
// sequence number, so a run can be replayed or scored without re-reading state.
import { createWriteStream, mkdirSync } from "node:fs";
import { visibleTo } from "./channels.js";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const defaultRunsDir = fileURLToPath(new URL("../runs/", import.meta.url));

// Resolved per call, not at module load, so TB_RUNS_DIR set by a test after
// import still takes effect.
const resolveRunsDir = () => process.env.TB_RUNS_DIR || defaultRunsDir;

export function runId(config) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const arm = config.condition.dispositionArm || "control";
  return `${config.scenarioId}__arm-${arm}__rep${config.repeat}__${stamp}`;
}

/**
 * @param {object} config
 * @param {object} manifest
 * @param {object} [pack]  supplied so visible_to can be computed from the channel
 *                         rather than asserted by each call site
 */
export function openRun(config, manifest, pack) {
  const dir = resolveRunsDir();
  mkdirSync(dir, { recursive: true });
  const id = runId(config);
  const path = join(dir, `${id}.jsonl`);
  const stream = createWriteStream(path, { flags: "a" });
  let seq = 0;

  const write = (type, data) =>
    new Promise((resolve, reject) => {
      // visible_to is derived from the channel, never passed in: an event whose
      // stated audience disagreed with the channel rules would be a lie in the
      // permanent record.
      const derived =
        pack && data && data.channel ? { visible_to: visibleTo(pack, data.channel) } : {};
      const line = JSON.stringify({
        seq: seq++,
        t: new Date().toISOString(),
        type,
        ...data,
        ...derived,
      });
      stream.write(line + "\n", (err) => (err ? reject(err) : resolve()));
    });

  return {
    id,
    path,
    /** Emit one event. Every event carries phase and, where it is a message,
     *  channel; visible_to is derived from the channel. */
    log: write,
    async start() {
      await write("run_start", { config, manifest });
    },
    async close(summary) {
      await write("run_end", { summary });
      await new Promise((resolve) => stream.end(resolve));
      return path;
    },
  };
}
