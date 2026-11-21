import { Link } from "@tanstack/react-router";
import { getCategory } from "@/lib/finance/categories";
import { formatMoney } from "@/lib/finance/money";
import { TXN_TYPE_LABELS } from "@/lib/finance/types";
import type { Source, Transaction } from "@/lib/data/queries";
import { CategoryIcon } from "./category-icon";
import { DemoBadge, ImportBadge, ScanBadge } from "./ui-bits";
import { cn } from "@/lib/utils";

export function TxnRow({ txn, sources }: { txn: Transaction; sources: Map<string, Source> }) {
  const isTransfer = txn.txn_type === "transfer";
  const src = txn.source_id ? sources.get(txn.source_id) : undefined;
  const dest = txn.to_source_id ? sources.get(txn.to_source_id) : undefined;
  const positive = txn.txn_type === "income" || txn.txn_type === "refund";
  const meta = isTransfer
    ? `${src?.name ?? "Source"} → ${dest?.name ?? "Destination"}`
    : `${getCategory(txn.category).label}${txn.merchant && txn.merchant !== txn.description ? ` · ${txn.merchant}` : ""}${src ? ` · ${src.name}` : ""}`;
  return (
    <Link to="/transactions/$id" params={{ id: txn.id }} className="flex items-center gap-3 rounded-2xl px-1 py-2.5 transition-colors hover:bg-muted/60">
      <CategoryIcon category={txn.category} transfer={isTransfer} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate font-semibold">{txn.description}</p>
          {txn.is_demo && <DemoBadge />}
          {txn.entry_method === "csv" && <ImportBadge />}
          {txn.entry_method === "receipt" && <ScanBadge />}
        </div>
        <p className="truncate text-xs text-muted-foreground">{meta}</p>
      </div>
      <div className="text-right">
        <p className={cn("num font-bold", positive ? "text-income" : isTransfer ? "text-transfer" : "text-expense")}>
          {isTransfer ? "" : positive ? "+" : "−"}
          {formatMoney(txn.amount_paise)}
        </p>
        <p className="text-[11px] text-muted-foreground">
          {txn.txn_type === "expense" ? new Date(txn.occurred_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : TXN_TYPE_LABELS[txn.txn_type as keyof typeof TXN_TYPE_LABELS]}
        </p>
      </div>
    </Link>
  );
}
