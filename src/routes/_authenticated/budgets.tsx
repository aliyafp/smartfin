import { createFileRoute, Link } from "@tanstack/react-router";
import { PiggyBank } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/smartfin/ui-bits";

export const Route = createFileRoute("/_authenticated/budgets")({
  head: () => ({ meta: [{ title: "Budgets — SMARTFIN" }] }),
  component: () => (
    <div>
      <PageHeader title="Budgets" />
      <EmptyState icon={<PiggyBank className="size-7" />} title="Budgets are coming in a later phase"
        body="Monthly category budgets, savings goals and recurring payments are planned for Phase 6. Until then, use Analytics to see where your money goes."
        action={<Button asChild variant="soft"><Link to="/analytics">Open Analytics</Link></Button>} />
    </div>
  ),
});
