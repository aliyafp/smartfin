// Embarko start: listens on the PORT Embarko assigns, on all interfaces (0.0.0.0).
import { readFileSync } from "node:fs";

const cfg = JSON.parse(readFileSync(new URL("./public-config.json", import.meta.url), "utf8"));
process.env.HOST = "0.0.0.0";
process.env.NITRO_HOST = "0.0.0.0";
process.env.PORT ||= "3000";
process.env.NITRO_PORT = process.env.PORT;
// Server code reads the same public backend values under their server names.
process.env.SUPABASE_URL ||= cfg.VITE_SUPABASE_URL;
process.env.SUPABASE_PUBLISHABLE_KEY ||= cfg.VITE_SUPABASE_PUBLISHABLE_KEY;
// Google sign-in: lets /~oauth/initiate forward to Lovable's sign-in service.
process.env.LOVABLE_OAUTH_PROJECT_ID ||= cfg.LOVABLE_OAUTH_PROJECT_ID;
process.env.LOVABLE_OAUTH_PROJECT_ENV ||= cfg.LOVABLE_OAUTH_PROJECT_ENV;

await import(new URL("../../.output/server/index.mjs", import.meta.url).href);
