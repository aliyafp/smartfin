import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ChevronRight, ScanLine } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageHeader, SkeletonBlock } from "@/components/smartfin/ui-bits";
import { TransactionForm } from "@/components/smartfin/transaction-form";
import { useFinanceData } from "@/hooks/use-finance-data";
import { createTransaction, errorMessage, qk } from "@/lib/data/queries";

export const Route = createFileRoute("/_authenticated/transactions/new")({
  head: () => ({ meta: [{ title: "Add transaction — SMARTFIN" }] }),
  component: NewTxn,
});

function NewTxn() {
  const { sources, isLoading } = useFinanceData();
  const qc = useQueryClient();
  const navigate = useNavigate();
  return (
    <div>
      <PageHeader title="Add transaction" back="/transactions" />
      <Link to="/scan" className="mb-5 flex items-center gap-3 rounded-3xl border border-border/70 bg-card p-4 shadow-card transition-colors hover:border-coral/50">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-coral/10 text-coral"><ScanLine className="size-6" /></span>
        <span className="min-w-0 flex-1">
          <span className="block font-bold">Scan & Extract</span>
          <span className="block text-xs text-muted-foreground">Read a receipt, bill or UPI screenshot instead of typing</span>
        </span>
        <ChevronRight className="size-5 text-muted-foreground" />
      </Link>
      {isLoading ? <SkeletonBlock className="h-96" /> : (
        <TransactionForm sources={sources} submitLabel="Save" cancelTo="/transactions" onSubmit={async (v) => {
          try {
            await createTransaction({ ...v, entry_method: "manual" });
            await qc.invalidateQueries({ queryKey: qk.txns });
            toast.success("Transaction saved");
            navigate({ to: "/transactions", search: {} });
          } catch (e) { toast.error(errorMessage(e)); }
        }} />
      )}
    </div>
  );
}
