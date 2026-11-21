import { createFileRoute } from "@tanstack/react-router";

// Lovable hosting answers /~oauth/initiate itself before the app runs. Hosts
// outside Lovable (Embarko) reach the app instead, so forward the Google
// sign-in request to Lovable's sign-in service the same way. Only active when
// the host sets LOVABLE_OAUTH_PROJECT_ID (deploy/embarko/start.mjs does).
const BROKER = "https://oauth.lovable.app/initiate";

export const Route = createFileRoute("/~oauth/initiate")({
  server: {
    handlers: {
      GET: ({ request }) => {
        const projectId = process.env["LOVABLE_OAUTH_PROJECT_ID"];
        if (!projectId) return new Response("Not found", { status: 404 });
        const incoming = new URL(request.url);
        const target = new URL(BROKER);
        for (const [k, v] of incoming.searchParams) {
          if (k !== "project_id" && k !== "project_env") target.searchParams.set(k, v);
        }
        target.searchParams.set("project_id", projectId);
        target.searchParams.set("project_env", process.env["LOVABLE_OAUTH_PROJECT_ENV"] ?? "prod");
        return Response.redirect(target.toString(), 302);
      },
    },
  },
});
