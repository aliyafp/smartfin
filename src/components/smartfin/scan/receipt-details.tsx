import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Card, SectionTitle } from "@/components/smartfin/ui-bits";
import { extractionQuery, imageUrlQuery, receiptItemsQuery } from "@/lib/data/scans";
import { getCategory } from "@/lib/finance/categories";
import { formatMoney } from "@/lib/finance/money";
import { DOCUMENT_TYPES, type DocumentType } from "@/lib/extract/types";
import { ZoomableImage } from "./image-viewer";

/** Items and source document of a transaction created by Scan & Extract. */
export function ReceiptDetails({ txnId, extractionId }: { txnId: string; extractionId: string | null }) {
  const items = useQuery(receiptItemsQuery(txnId));
  const ex = useQuery({ ...extractionQuery(extractionId ?? "none"), enabled: Boolean(extractionId) });
  const img = useQuery(imageUrlQuery(ex.data?.file_path ?? null));
  const reviewed = ex.data?.reviewed_payload as { billed_total_paise?: number | null; amount_paid_paise?: number | null; original_merchant?: string | null } | null | undefined;
  const docType = (ex.data?.user_document_type ?? ex.data?.document_type) as DocumentType | null | undefined;
  const list = items.data ?? [];
  const sum = list.reduce((a, i) => a + (i.line_total_paise ?? 0), 0);
  return (
    <>
      {list.length > 0 && (
        <Card className="space-y-2">
          <SectionTitle title={`Items (${list.length})`} action={<span className="num text-sm font-semibold">{formatMoney(sum, { decimals: "always" })}</span>} />
          <p className="text-xs text-muted-foreground">Details of this one purchase — not separate payments.</p>
          <ul className="divide-y divide-border">
            {list.map((i) => (
              <li key={i.id} className="flex items-start justify-between gap-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="font-semibold">{i.normalised_name ?? i.original_name}</p>
                  <p className="text-xs text-muted-foreground">{[i.quantity !== null && `Qty ${Number(i.quantity)}`, i.unit_price_paise !== null && `@ ${formatMoney(i.unit_price_paise)}`, i.category && getCategory(i.category).label, i.normalised_name && `printed “${i.original_name}”`].filter(Boolean).join(" · ")}</p>
                </div>
                <span className="num font-semibold">{i.line_total_paise !== null ? formatMoney(i.line_total_paise, { decimals: "always" }) : "—"}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {ex.data && (
        <Card className="space-y-2">
          <SectionTitle title="Scanned document" />
          <div className="space-y-1 text-sm">
            {docType && <p><span className="text-muted-foreground">Type: </span>{DOCUMENT_TYPES[docType]?.label ?? docType}</p>}
            {reviewed?.original_merchant && <p><span className="text-muted-foreground">Merchant as printed: </span>{reviewed.original_merchant}</p>}
            {reviewed?.billed_total_paise != null && reviewed.amount_paid_paise != null && reviewed.billed_total_paise !== reviewed.amount_paid_paise && (
              <p><span className="text-muted-foreground">Bill total </span>{formatMoney(reviewed.billed_total_paise)}<span className="text-muted-foreground"> · paid </span>{formatMoney(reviewed.amount_paid_paise)}</p>
            )}
          </div>
          {img.data ? <ZoomableImage src={img.data} alt="Scanned document" /> : <p className="text-xs text-muted-foreground">The image wasn't kept. <Link to="/scan" hash="privacy" className="font-semibold text-coral">Privacy settings</Link></p>}
        </Card>
      )}
    </>
  );
}
