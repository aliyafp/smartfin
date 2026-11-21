// Embarko build: same app, built as a Node server instead of Lovable's edge bundle.
// Public backend values come from public-config.json because .env files are not uploaded.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const cfg = JSON.parse(readFileSync(new URL("./public-config.json", import.meta.url), "utf8"));
for (const [k, v] of Object.entries(cfg)) if (k.startsWith("VITE_") && !process.env[k]) process.env[k] = v;
process.env.NITRO_PRESET = "node-server";

const r = spawnSync("npx", ["vite", "build"], { stdio: "inherit", env: process.env });
process.exit(r.status ?? 1);
