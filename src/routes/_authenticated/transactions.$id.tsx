import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { importsQuery } from "@/lib/data/imports";
import { useState } from "react";
import { toast } from "sonner";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Card, DemoBadge, EmptyState, ImportBadge, PageHeader, ScanBadge, SkeletonBlock } from "@/components/smartfin/ui-bits";
import { ReceiptDetails } from "@/components/smartfin/scan/receipt-details";
import { CategoryIcon } from "@/components/smartfin/category-icon";
import { TransactionForm } from "@/components/smartfin/transaction-form";
import { useFinanceData } from "@/hooks/use-finance-data";
import { deleteTransaction, errorMessage, qk, updateTransaction } from "@/lib/data/queries";
import { getCategory } from "@/lib/finance/categories";
import { formatMoney } from "@/lib/finance/money";
import { TXN_TYPE_LABELS } from "@/lib/finance/types";

export const Route = createFileRoute("/_authenticated/transactions/$id")({
  head: () => ({ meta: [{ title: "Transaction — SMARTFIN" }] }),
  component: TxnDetail,
});

const ENTRY: Record<string, string> = { manual: "Entered manually", csv: "CSV import", receipt: "Scan & Extract", demo: "Demo record" };

function TxnDetail() {
  const { id } = Route.useParams();
  const { txns, sources, sourceMap, isLoading } = useFinanceData();
  const [editing, setEditing] = useState(false);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const txn = txns.find((t) => t.id === id);
  const imports = useQuery({ ...importsQuery, enabled: Boolean(txn?.import_batch_id) });
  const importFile = txn?.import_batch_id ? imports.data?.find((b) => b.id === txn.import_batch_id)?.file_name : undefined;

  if (isLoading) return <div><PageHeader title="Transaction" back="/transactions" /><SkeletonBlock className="h-80" /></div>;
  if (!txn) return <div><PageHeader title="Transaction" back="/transactions" /><EmptyState icon={<Trash2 className="size-7" />} title="Transaction not found" body="It may have been deleted." /></div>;

  if (editing) {
    return (
      <div>
        <PageHeader title="Edit transaction" />
        <TransactionForm initial={txn} sources={sources} submitLabel="Save changes" cancelTo={`/transactions/${txn.id}`} onSubmit={async (v) => {
          try { await updateTransaction(txn.id, v); await qc.invalidateQueries({ queryKey: qk.txns }); toast.success("Changes saved"); setEditing(false); }
          catch (e) { toast.error(errorMessage(e)); }
        }} />
        <Button variant="ghost" className="mt-2 w-full" onClick={() => setEditing(false)}>Back to details</Button>
      </div>
    );
  }

  const isTransfer = txn.txn_type === "transfer";
  const positive = txn.txn_type === "income" || txn.txn_type === "refund";
  const d = new Date(txn.occurred_at);
  const rows: [string, string][] = [
    ["Type", TXN_TYPE_LABELS[txn.txn_type]],
    ...(txn.merchant ? [["Merchant", txn.merchant] as [string, string]] : []),
    ["Date", d.toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" })],
    ["Time", d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true }).toUpperCase()],
    ...(isTransfer ? [] : [["Category", getCategory(txn.category).label] as [string, string]]),
    [isTransfer ? "From" : "Source", txn.source_id ? sourceMap.get(txn.source_id)?.name ?? "Removed source" : "Not specified"],
    ...(isTransfer ? [["To", txn.to_source_id ? sourceMap.get(txn.to_source_id)?.name ?? "Removed source" : "—"] as [string, string]] : []),
    ["Payment method", txn.payment_method ?? "—"],
    ["Reference", txn.reference ?? "—"],
    ["Entry method", ENTRY[txn.entry_method] ?? txn.entry_method],
    ...(txn.import_batch_id ? [["Imported from", importFile ?? "CSV file"] as [string, string]] : []),
  ];

  return (
    <div className="space-y-5">
      <PageHeader title="Transaction" back="/transactions" />
      <Card className="text-center">
        <CategoryIcon category={txn.category} transfer={isTransfer} className="mx-auto size-14" />
        <p className="mt-3 flex items-center justify-center gap-2 font-semibold">{txn.description}{txn.is_demo && <DemoBadge />}{txn.entry_method === "csv" && <ImportBadge />}{txn.entry_method === "receipt" && <ScanBadge />}</p>
        <p className={`num mt-1 text-4xl font-extrabold ${positive ? "text-income" : isTransfer ? "text-transfer" : "text-expense"}`}>
          {isTransfer ? "" : positive ? "+" : "−"}{formatMoney(txn.amount_paise, { decimals: "always" })}
        </p>
        {txn.txn_type === "refund" && <p className="mt-1 text-xs text-muted-foreground">Refunds reduce your recorded spending. They don't count as income.</p>}
        {isTransfer && <p className="mt-1 text-xs text-muted-foreground">Transfers between your own sources aren't counted as income or spending.</p>}
      </Card>
      <Card className="divide-y divide-border p-0">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 px-5 py-3 text-sm"><span className="text-muted-foreground">{k}</span><span className="text-right font-semibold">{v}</span></div>
        ))}
        {txn.notes && <div className="px-5 py-3 text-sm"><p className="text-muted-foreground">Notes</p><p className="mt-1 whitespace-pre-wrap">{txn.notes}</p></div>}
      </Card>
      {txn.entry_method === "receipt" && <ReceiptDetails txnId={txn.id} extractionId={txn.extraction_id} />}
      <div className="flex gap-3">
        <Button variant="soft" size="lg" className="flex-1" onClick={() => setEditing(true)}><Pencil />Edit</Button>
        <AlertDialog>
          <AlertDialogTrigger asChild><Button variant="destructive" size="lg" className="flex-1"><Trash2 />Delete</Button></AlertDialogTrigger>
          <AlertDialogContent className="rounded-3xl">
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this transaction?</AlertDialogTitle>
              <AlertDialogDescription>“{txn.description}” for {formatMoney(txn.amount_paise)} will be permanently removed. Your totals will update.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="rounded-full">Keep it</AlertDialogCancel>
              <AlertDialogAction className="rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={async () => {
                try { await deleteTransaction(txn.id); await qc.invalidateQueries({ queryKey: qk.txns }); toast.success("Transaction deleted"); navigate({ to: "/transactions", search: {} }); }
                catch (e) { toast.error(errorMessage(e)); }
              }}>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      <p className="text-center text-xs text-muted-foreground"><Link to="/transactions" search={{}} className="font-semibold text-coral">Back to all transactions</Link></p>
    </div>
  );
}
