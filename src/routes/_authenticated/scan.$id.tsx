import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, CircleAlert, Info, Loader2, Pencil, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, EmptyState, InlineAlert, NativeSelect, PageHeader, SectionTitle, SkeletonBlock } from "@/components/smartfin/ui-bits";
import { ConfidenceBadge } from "@/components/smartfin/scan/confidence-badge";
import { ZoomableImage } from "@/components/smartfin/scan/image-viewer";
import { useFinanceData } from "@/hooks/use-finance-data";
import { errorMessage, qk } from "@/lib/data/queries";
import {
  categoryRulesQuery, createCategoryRule, deleteExtractionImage, discardExtraction, DuplicateReferenceError, extractionQuery, imageUrlQuery,
  markWaiting, replaceExtractionImage, saveExtraction, scanKeys, invalidateScans, type Extraction,
} from "@/lib/data/scans";
import { extractDocument } from "@/lib/extract/scan.functions";
import { prepareImage, ImageFileError } from "@/lib/extract/image";
import { normaliseExtraction, primaryAmount } from "@/lib/extract/normalise";
import { confirmAs, interpret } from "@/lib/extract/interpret";
import { hasBlockingError, runChecks, type Check } from "@/lib/extract/validate";
import { suggestScanCategory, type CategoryRule } from "@/lib/extract/categorise";
import { findScanDuplicates } from "@/lib/extract/duplicates";
import { buildSavePayload, initialForm, initialItems, itemsForChecks, type FormErrors, type ReviewForm, type ReviewItem } from "@/lib/extract/review";
import { CONFIDENCE_LABELS, DOCUMENT_TYPES, DOCUMENT_TYPE_KEYS, TXN_STATE_LABELS, type Confidence, type DocumentType, type NormalisedExtraction, type RawExtraction } from "@/lib/extract/types";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, PAYMENT_METHODS, getCategory } from "@/lib/finance/categories";
import { formatMoney, parseAmountToPaise } from "@/lib/finance/money";
import { TXN_TYPE_LABELS, type TxnType } from "@/lib/finance/types";
import type { Json } from "@/integrations/supabase/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/scan/$id")({
  head: () => ({ meta: [{ title: "Review scan — SMARTFIN" }, { name: "description", content: "Check what SMARTFIN read from your document before saving it." }] }),
  component: ReviewPage,
});

interface Reviewed { form: ReviewForm; items: ReviewItem[]; typeChosen: boolean; confirmedAs: TxnType | null }

function ReviewPage() {
  const { id } = Route.useParams();
  const q = useQuery(extractionQuery(id));
  const qc = useQueryClient();
  const runExtract = useServerFn(extractDocument);
  const [retrying, setRetrying] = useState(false);
  const navigate = useNavigate();

  if (q.isLoading) return <div><PageHeader title="Review scan" back="/scan" /><SkeletonBlock className="h-96" /></div>;
  const ex = q.data;
  if (q.error || !ex) return <div><PageHeader title="Review scan" back="/scan" /><EmptyState icon={<Trash2 className="size-7" />} title="Scan not found" body={q.error ? errorMessage(q.error) : "It may have been discarded."} /></div>;

  const retry = async () => {
    setRetrying(true);
    try {
      const res = await runExtract({ data: { extractionId: ex.id } });
      if (!res.ok) toast.error(res.message);
    } catch { toast.error("Connection lost. Try again."); }
    await invalidateScans(qc);
    setRetrying(false);
  };

  if (ex.processing_status === "confirmed") return (
    <div><PageHeader title="Review scan" back="/scan" />
      <EmptyState icon={<CheckCircle2 className="size-7" />} title="Already saved" body="This document was confirmed and saved as a transaction."
        action={ex.transaction_id ? <Button asChild><Link to="/transactions/$id" params={{ id: ex.transaction_id }}>Open transaction</Link></Button> : undefined} />
    </div>
  );
  if (ex.processing_status === "discarded") return <div><PageHeader title="Review scan" back="/scan" /><EmptyState icon={<Trash2 className="size-7" />} title="Scan discarded" body="Nothing was saved from this document." /></div>;
  if (ex.processing_status !== "extracted" && ex.processing_status !== "waiting") {
    return (
      <div className="space-y-4"><PageHeader title="Review scan" back="/scan" />
        <InlineAlert tone={ex.processing_status === "failed" ? "error" : "info"} title={ex.processing_status === "failed" ? "This document couldn't be read" : ex.processing_status === "processing" ? "Still reading…" : "Not read yet"}>
          {ex.processing_status === "failed" ? failText(ex.error_code) : "Reading can take up to a minute."}
        </InlineAlert>
        <ImageSection ex={ex} onChanged={retry} />
        <div className="flex gap-3">
          <Button size="lg" className="flex-1" onClick={retry} disabled={retrying || !ex.file_path}>{retrying ? <Loader2 className="animate-spin" /> : <RefreshCw />}Try again</Button>
          <DiscardButton ex={ex} onDone={() => navigate({ to: "/scan" })} />
        </div>
      </div>
    );
  }
  return <ReviewBody key={ex.updated_at} ex={ex} onReread={retry} />;
}

function failText(code: string | null) {
  switch (code) {
    case "no_text": return "No readable text was found. Retake the photo flat, in good light and in focus, then try again.";
    case "busy": return "The reading service is busy. Wait a minute and try again.";
    case "credits": return "AI credits have run out for this workspace. Add credits, then try again.";
    case "timeout": return "Reading took too long. Try again, or replace the image with a clearer one.";
    case "no_image": return "The image is missing. Replace it to try again.";
    case "consent_required": return "Agree to image processing on the Scan page first.";
    default: return "The reading service had a problem. Your image is kept so you can try again.";
  }
}

function ReviewBody({ ex, onReread }: { ex: Extraction; onReread: () => Promise<void> }) {
  const raw = ex.extracted_payload as unknown as RawExtraction;
  const n = useMemo(() => normaliseExtraction(raw), [raw]);
  const saved = ex.reviewed_payload as unknown as Reviewed | null;
  const { txns, sources } = useFinanceData();
  const rulesQ = useQuery(categoryRulesQuery);
  const rules: CategoryRule[] = useMemo(() => (rulesQ.data ?? []).map((r) => ({ pattern: r.pattern, match_field: r.match_field as "merchant" | "item", category: r.category })), [rulesQ.data]);
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [typeChosen, setTypeChosen] = useState(saved?.typeChosen ?? false);
  const [confirmedAs, setConfirmedAs] = useState<TxnType | null>(saved?.confirmedAs ?? null);
  const [docType, setDocType] = useState<DocumentType>(saved?.form.docType ?? (ex.user_document_type as DocumentType | null) ?? n.documentType);
  const base = useMemo(() => interpret(n, typeChosen ? docType : null), [n, typeChosen, docType]);
  const interp = confirmedAs ? confirmAs(base, confirmedAs) : base;
  const catFor = (t: TxnType | null, merchant: string) => suggestScanCategory({ merchant, description: n.description.value, documentType: docType, txnType: t, items: n.items.map((i) => ({ name: i.originalName, lineTotalPaise: i.lineTotalPaise })) }, rules);

  const [form, setForm] = useState<ReviewForm>(() => saved?.form ?? initialForm(n, interp, catFor(interp.txnType, n.merchantNormalised ?? n.merchant.value ?? "")));
  const [items, setItems] = useState<ReviewItem[]>(() => saved?.items ?? initialItems(n, rules, docType));
  const [errors, setErrors] = useState<FormErrors>({});
  const [meaningOk, setMeaningOk] = useState(false);
  const [keepImage, setKeepImage] = useState(false);
  const [makeRule, setMakeRule] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dupOpen, setDupOpen] = useState(false);
  const [dupRefOnly, setDupRefOnly] = useState(false);

  const amountPaise = parseAmountToPaise(form.amount);
  const checks = useMemo(() => runChecks({ ...n, items: n.items.map((it, i) => ({ ...it, lineTotalPaise: itemsForChecks(items)[i]?.lineTotalPaise ?? null })) }, { amountPaise, dateIso: form.date || null }), [n, items, amountPaise, form.date]);
  const blocking = hasBlockingError(checks);
  const [editing, setEditing] = useState(blocking || interp.needsTypeChoice);
  const dups = useMemo(() => findScanDuplicates({ reference: form.reference || null, receiptNumber: n.receiptNumber.value, merchant: form.merchant || null, description: form.description || null, amountPaise, dateIso: form.date || null, txnType: form.txnType }, txns), [form, n.receiptNumber.value, amountPaise, txns]);
  const suggestion = catFor(form.txnType, form.merchant);
  const set = <K extends keyof ReviewForm>(k: K, v: ReviewForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  const applyType = (t: TxnType) => {
    setConfirmedAs(t);
    setForm((f) => {
      const cats = t === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
      const keep = t !== "transfer" && cats.some((c) => c.key === f.category);
      const s = catFor(t, f.merchant);
      return { ...f, txnType: t, category: keep ? f.category : s.category && s.confidence !== "low" ? s.category : "" };
    });
  };
  const chooseDocType = (d: DocumentType) => {
    setDocType(d); setTypeChosen(true); setConfirmedAs(null);
    const i = interpret(n, d);
    setForm((f) => ({ ...f, docType: d, txnType: i.txnType }));
  };

  const reviewedPayload = (): Json => ({
    form, items, typeChosen, confirmedAs,
    detected_document_type: n.documentType, original_merchant: n.merchant.value, billed_total_paise: n.total.value, amount_paid_paise: n.amountPaid.value,
  } as unknown as Json);

  const save = async (allowDuplicate: boolean) => {
    if (!interp.savable || !form.txnType) { toast.error("Choose what this document represents first."); return; }
    if (interp.needsConfirmation && !meaningOk) { toast.error("Tick the confirmation box first."); return; }
    const built = buildSavePayload({ ...form, docType }, items);
    if (!built.ok) { setErrors(built.errors); setEditing(true); toast.error("Fix the highlighted fields."); return; }
    setErrors({});
    if (dups.length && !allowDuplicate) { setDupRefOnly(false); setDupOpen(true); return; }
    setBusy(true);
    try {
      const txnId = await saveExtraction({ extractionId: ex.id, txn: built.payload.txn, items: built.payload.items, allowDuplicate, keepImage, reviewed: reviewedPayload(), validation: checks as unknown as Json });
      if (makeRule && form.category && form.merchant.trim()) await createCategoryRule(form.merchant, "merchant", form.category).catch(() => toast.warning("The category rule couldn't be saved."));
      if (!keepImage && ex.file_path) await deleteExtractionImage(ex).catch(() => toast.warning("The image couldn't be deleted. You can delete it on the Scan page."));
      // Refresh transactions first so the dashboard and lists include the new record, then leave this screen.
      await qc.invalidateQueries({ queryKey: qk.txns });
      toast.success("Transaction saved");
      await navigate({ to: "/transactions/$id", params: { id: txnId } });
      // The image file may have just been deleted: refresh records but don't re-request image links.
      void invalidateScans(qc);
    } catch (e) {
      if (e instanceof DuplicateReferenceError) { setDupRefOnly(true); setDupOpen(true); }
      else toast.error(errorMessage(e));
    } finally { setBusy(false); }
  };

  const keepWaiting = async () => {
    setBusy(true);
    try { await markWaiting(ex.id, reviewedPayload()); await invalidateScans(qc); toast.success("Kept in your Waiting list — nothing added to spending"); navigate({ to: "/scan" }); }
    catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  };

  const conf = (c: Confidence) => <ConfidenceBadge level={c} />;
  const amountConf: Confidence = n.amountPaid.value !== null ? n.amountPaid.confidence : n.amount.value !== null ? n.amount.confidence : n.total.confidence;
  const cats = form.txnType === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const itemsSum = items.reduce((a, it) => a + (parseAmountToPaise(it.lineTotal) ?? 0), 0);

  return (
    <div className="space-y-5 pb-4">
      <PageHeader title="Review scan" subtitle="Check before anything is saved" back="/scan" />

      {/* 1. Original image */}
      <ImageSection ex={ex} onChanged={onReread} />

      {/* 2. Document identification */}
      <Card className="space-y-3">
        <SectionTitle title="Document" action={<ConfidenceBadge level={ex.classification_confidence as Confidence ?? "low"} />} />
        <div className="space-y-1.5">
          <label htmlFor="doctype" className="text-xs font-semibold text-muted-foreground">Document type</label>
          <select id="doctype" value={docType} onChange={(e) => chooseDocType(e.target.value as DocumentType)} className={cn("h-11 w-full rounded-2xl border bg-card px-3 text-sm", interp.needsTypeChoice ? "border-saffron ring-2 ring-saffron/40" : "border-input")}>
            {DOCUMENT_TYPE_KEYS.map((k) => <option key={k} value={k}>{DOCUMENT_TYPES[k].label}</option>)}
          </select>
          {interp.needsTypeChoice && <p className="text-xs font-medium text-plum">SMARTFIN isn't sure what this is. Compare with the image and choose the right type.</p>}
        </div>
        <div className="rounded-2xl bg-muted/50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">What it represents</p>
          <p className="mt-0.5 font-bold">{TXN_STATE_LABELS[interp.state]}</p>
          {n.statusText && <p className="text-sm text-muted-foreground">Status printed: “{n.statusText}”</p>}
          {interp.reasons.length > 0 && <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">{interp.reasons.map((r) => <li key={r}>• {r}</li>)}</ul>}
        </div>
        {!interp.savable && <NotSavableActions state={interp.state} busy={busy} onWait={keepWaiting} onRecord={applyType} direction={n.direction} />}
        {interp.savable && interp.needsConfirmation && (
          <label className="flex items-start gap-3 rounded-2xl border border-saffron/50 bg-saffron/10 p-3 text-sm">
            <Checkbox checked={meaningOk} onCheckedChange={(v) => setMeaningOk(v === true)} className="mt-0.5" aria-label="Confirm the transaction type" />
            <span>I confirm this is a completed <b>{form.txnType ? TXN_TYPE_LABELS[form.txnType].toLowerCase() : "transaction"}</b>{form.txnType === "income" ? " (not a refund, loan repayment or transfer)" : ""}.</span>
          </label>
        )}
      </Card>

      {/* 3. Transaction information */}
      {interp.savable && (
        <Card className="space-y-3">
          <SectionTitle title="Transaction" action={!editing ? <Button size="sm" variant="soft" onClick={() => setEditing(true)}><Pencil />Edit information</Button> : <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Done</Button>} />
          {!editing ? (
            <dl className="divide-y divide-border text-sm">
              <Row label="Merchant" badge={conf(n.merchant.value ? n.merchant.confidence : n.counterparty.confidence)} value={form.merchant || "—"} sub={n.merchant.value && n.merchant.value !== form.merchant ? `As printed: ${n.merchant.value}` : undefined} />
              <Row label="Amount" badge={conf(amountPaise ? amountConf : "not_detected")} value={amountPaise ? formatMoney(amountPaise, { decimals: "always" }) : "—"}
                sub={n.total.value !== null && n.amountPaid.value !== null && n.total.value !== n.amountPaid.value ? `Bill total ${formatMoney(n.total.value)} · paid ${formatMoney(n.amountPaid.value)}` : undefined} />
              <Row label="Date" badge={conf(form.date ? n.date.confidence : "not_detected")} value={form.date ? new Date(`${form.date}T12:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"} sub={n.date.raw ? `As printed: ${n.date.raw}` : undefined} />
              <Row label="Time" badge={conf(form.time ? n.time.confidence : "not_detected")} value={form.time || "—"} />
              <Row label="Type" value={form.txnType ? TXN_TYPE_LABELS[form.txnType] : "—"} />
              {form.txnType !== "transfer" && <Row label="Category" badge={form.category ? <ConfidenceBadge level={suggestion.category === form.category ? suggestion.confidence : "high"} /> : undefined} value={form.category ? getCategory(form.category).label : suggestion.category ? `Not set (maybe ${getCategory(suggestion.category).label})` : "Not set"} />}
              <Row label="Payment method" badge={conf(form.paymentMethod ? n.paymentMethod.confidence : "not_detected")} value={form.paymentMethod || "—"} sub={n.paymentApp.value ? `App: ${n.paymentApp.value}` : !form.paymentMethod && n.paymentMethod.raw ? `As printed: ${n.paymentMethod.raw}` : undefined} />
              <Row label="Reference ID" badge={conf(form.reference ? n.reference.confidence : "not_detected")} value={form.reference || "—"} />
              {n.receiptNumber.value && <Row label="Receipt / invoice no." badge={conf(n.receiptNumber.confidence)} value={n.receiptNumber.value} />}
              {n.bankName.value && <Row label="Bank" value={n.bankName.value} />}
              {n.gstAmount.value !== null && <Row label="GST" value={`${formatMoney(n.gstAmount.value, { decimals: "always" })}${n.gstRate.value ? ` @ ${n.gstRate.value}%` : ""}`} />}
            </dl>
          ) : (
            <div className="space-y-3">
              <Field label="Transaction type" error={errors.txnType}>
                <div className="grid grid-cols-4 gap-1 rounded-full bg-muted p-1" role="radiogroup" aria-label="Transaction type">
                  {(Object.keys(TXN_TYPE_LABELS) as TxnType[]).map((t) => (
                    <button key={t} type="button" role="radio" aria-checked={form.txnType === t} onClick={() => applyType(t)} className={cn("h-9 rounded-full text-xs font-bold", form.txnType === t ? "bg-coral text-on-brand" : "text-muted-foreground")}>{TXN_TYPE_LABELS[t]}</button>
                  ))}
                </div>
              </Field>
              <Field label="Amount (₹)" error={errors.amount} badge={conf(amountConf)}><Input inputMode="decimal" value={form.amount} onChange={(e) => set("amount", e.target.value)} className="h-11 rounded-2xl" /></Field>
              <Field label="Merchant" error={errors.merchant} badge={conf(n.merchant.value ? n.merchant.confidence : "not_detected")} hint={n.merchant.value ? `As printed: ${n.merchant.value}` : undefined}><Input value={form.merchant} maxLength={80} onChange={(e) => set("merchant", e.target.value)} className="h-11 rounded-2xl" /></Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Date" error={errors.date} badge={conf(n.date.value ? n.date.confidence : "not_detected")}><Input type="date" value={form.date} onChange={(e) => set("date", e.target.value)} className="h-11 rounded-2xl" /></Field>
                <Field label="Time" error={errors.time}><Input type="time" value={form.time} onChange={(e) => set("time", e.target.value)} className="h-11 rounded-2xl" /></Field>
              </div>
              {n.dateAmbiguous && n.dateAlternative && n.date.value && (
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="text-muted-foreground">“{n.date.raw}” means:</span>
                  {[n.date.value, n.dateAlternative].map((d) => (
                    <button key={d} type="button" onClick={() => set("date", d)} className={cn("rounded-full border px-2.5 py-1 font-semibold", form.date === d ? "border-coral bg-coral/10 text-coral" : "border-border")}>{new Date(`${d}T12:00`).toLocaleDateString("en-IN", { day: "numeric", month: "long" })}</button>
                  ))}
                </div>
              )}
              {form.txnType !== "transfer" && (
                <Field label="Category" hint={suggestion.category && suggestion.source ? `Suggested: ${getCategory(suggestion.category).label} (${CONFIDENCE_LABELS[suggestion.confidence].toLowerCase()}, from ${suggestion.source.replace("_", " ")})` : undefined}>
                  <div className="flex flex-wrap gap-1.5">
                    {cats.map((c) => (
                      <button key={c.key} type="button" aria-pressed={form.category === c.key} onClick={() => set("category", form.category === c.key ? "" : c.key)} className={cn("rounded-full border px-2.5 py-1 text-xs font-semibold", form.category === c.key ? "border-coral bg-coral/10 text-coral" : suggestion.category === c.key ? "border-dashed border-coral/60 text-foreground" : "border-border text-muted-foreground")}>{c.label}</button>
                    ))}
                  </div>
                </Field>
              )}
              <Field label={form.txnType === "transfer" ? "From source" : "Source (optional)"} error={errors.source}>
                <NativeSelect label="Source" value={form.sourceId} onChange={(v) => set("sourceId", v)} placeholder={sources.length ? "Not specified" : "No sources yet"} options={sources.map((s) => [s.id, s.name])} />
              </Field>
              {form.txnType === "transfer" && (
                <Field label="To source" error={errors.to}>
                  <NativeSelect label="To source" value={form.toSourceId} onChange={(v) => set("toSourceId", v)} placeholder="Choose destination" options={sources.filter((s) => s.id !== form.sourceId).map((s) => [s.id, s.name])} />
                </Field>
              )}
              <Field label="Payment method" badge={conf(n.paymentMethod.confidence)}>
                <NativeSelect label="Payment method" value={form.paymentMethod} onChange={(v) => set("paymentMethod", v)} placeholder="Not specified" options={PAYMENT_METHODS.map((m) => [m, m])} />
              </Field>
              <Field label="Reference ID" error={errors.reference} badge={conf(n.reference.confidence)}><Input value={form.reference} maxLength={64} onChange={(e) => set("reference", e.target.value)} className="h-11 rounded-2xl" /></Field>
              <Field label="Notes (optional)" error={errors.notes}><Textarea value={form.notes} maxLength={500} rows={2} onChange={(e) => set("notes", e.target.value)} className="rounded-2xl" /></Field>
            </div>
          )}
        </Card>
      )}

      {/* 4. Items */}
      {(items.length > 0 || editing) && interp.savable && (
        <Card className="space-y-3">
          <SectionTitle title={`Items (${items.length})`} action={items.length > 0 ? <span className="num text-sm font-semibold">{formatMoney(itemsSum, { decimals: "always" })}</span> : undefined} />
          <p className="text-xs text-muted-foreground">Items are saved as details of this one purchase. They don't count as separate payments.</p>
          {errors.items && <p className="text-xs font-medium text-destructive">{errors.items}</p>}
          <ul className="space-y-2">
            {items.map((it, idx) => (
              <li key={it.id} className={cn("rounded-2xl border p-3", it.confidence === "low" ? "border-coral/50 bg-coral/5" : "border-border/70")}>
                {!editing ? (
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 text-sm font-semibold"><span className="truncate">{it.name}</span>{it.confidence !== "high" && <ConfidenceBadge level={it.confidence} />}</p>
                      <p className="text-xs text-muted-foreground">{[it.quantity && `Qty ${it.quantity}`, it.unitPrice && `@ ₹${it.unitPrice}`, it.category ? getCategory(it.category).label : it.suggested ? `maybe ${getCategory(it.suggested).label}` : "No category"].filter(Boolean).join(" · ")}</p>
                    </div>
                    <span className="num text-sm font-bold">{it.lineTotal ? `₹${it.lineTotal}` : "—"}</span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <Input aria-label={`Item ${idx + 1} name`} value={it.name} onChange={(e) => setItems((xs) => xs.map((x) => x.id === it.id ? { ...x, name: e.target.value, edited: true } : x))} className="h-10 rounded-xl" />
                      <Button size="icon" variant="ghost" aria-label={`Remove item ${idx + 1}`} onClick={() => setItems((xs) => xs.filter((x) => x.id !== it.id))}><X /></Button>
                    </div>
                    {it.originalName && it.name !== it.originalName && <p className="text-[11px] text-muted-foreground">As printed: {it.originalName}</p>}
                    <div className="grid grid-cols-3 gap-2">
                      <Input aria-label="Quantity" placeholder="Qty" inputMode="decimal" value={it.quantity} onChange={(e) => setItems((xs) => xs.map((x) => x.id === it.id ? { ...x, quantity: e.target.value, edited: true } : x))} className="h-10 rounded-xl" />
                      <Input aria-label="Unit price" placeholder="Unit ₹" inputMode="decimal" value={it.unitPrice} onChange={(e) => setItems((xs) => xs.map((x) => x.id === it.id ? { ...x, unitPrice: e.target.value, edited: true } : x))} className="h-10 rounded-xl" />
                      <Input aria-label="Line total" placeholder="Total ₹" inputMode="decimal" value={it.lineTotal} onChange={(e) => setItems((xs) => xs.map((x) => x.id === it.id ? { ...x, lineTotal: e.target.value, edited: true } : x))} className="h-10 rounded-xl" />
                    </div>
                    <NativeSelect label="Item category" className="h-10 rounded-xl" value={it.category} onChange={(v) => setItems((xs) => xs.map((x) => x.id === it.id ? { ...x, category: v, edited: true } : x))} placeholder={it.suggested ? `No category (maybe ${getCategory(it.suggested).label})` : "No category"} options={EXPENSE_CATEGORIES.map((c) => [c.key, c.label])} />
                  </div>
                )}
              </li>
            ))}
          </ul>
          {editing && <Button variant="soft" size="sm" onClick={() => setItems((xs) => [...xs, { id: `new-${Date.now()}`, originalName: "", name: "", quantity: "", unitPrice: "", lineTotal: "", category: "", suggested: null, confidence: "high", edited: true }])}><Plus />Add item</Button>}
        </Card>
      )}

      {/* 5. Validation */}
      <Card className="space-y-2">
        <SectionTitle title="Checks" />
        {checks.length === 0 && dups.length === 0 && <p className="text-sm text-muted-foreground">No problems found.</p>}
        {dups.length > 0 && (
          <CheckRow check={{ id: "dup", level: "warning", title: "This transaction may already exist in SMARTFIN.", detail: dups.map((d) => d.reason).join(" · ") }}>
            <div className="mt-1 flex flex-wrap gap-2">{dups.slice(0, 3).map((d) => <Link key={d.id} to="/transactions/$id" params={{ id: d.id }} className="text-xs font-semibold text-coral underline-offset-2 hover:underline">Open existing</Link>)}</div>
          </CheckRow>
        )}
        {checks.map((c) => <CheckRow key={c.id} check={c} />)}
        {n.notesForReview && <CheckRow check={{ id: "note", level: "info", title: "Note from reading", detail: n.notesForReview }} />}
      </Card>

      {interp.savable && (
        <Card className="space-y-3">
          {form.txnType !== "transfer" && form.category && form.merchant.trim() && (
            <label className="flex items-start gap-3 text-sm"><Checkbox checked={makeRule} onCheckedChange={(v) => setMakeRule(v === true)} className="mt-0.5" /><span>Always use <b>{getCategory(form.category).label}</b> for future scans from “{form.merchant.trim()}”</span></label>
          )}
          {ex.file_path && <label className="flex items-start gap-3 text-sm"><Checkbox checked={keepImage} onCheckedChange={(v) => setKeepImage(v === true)} className="mt-0.5" /><span>Keep a copy of the image with this transaction (otherwise it's deleted after saving)</span></label>}
        </Card>
      )}

      {/* Actions */}
      <div className="space-y-2">
        {interp.savable && (
          <Button size="lg" className="w-full" disabled={busy || blocking || (interp.needsConfirmation && !meaningOk)} onClick={() => void save(false)}>
            {busy ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}Confirm and Save
          </Button>
        )}
        {interp.savable && blocking && <p className="text-center text-xs text-destructive">Fix the errors in Checks to save.</p>}
        <div className="flex gap-2">
          {interp.savable && !editing && <Button variant="soft" size="lg" className="flex-1" onClick={() => setEditing(true)}><Pencil />Edit Information</Button>}
          <DiscardButton ex={ex} onDone={() => navigate({ to: "/scan" })} />
        </div>
      </div>

      <Dialog open={dupOpen} onOpenChange={setDupOpen}>
        <DialogContent className="rounded-3xl">
          <DialogHeader>
            <DialogTitle>This transaction may already exist in SMARTFIN.</DialogTitle>
            <DialogDescription>{dupRefOnly ? "A saved transaction already has this reference number." : dups.map((d) => d.reason).join(" · ")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            {dups.slice(0, 3).map((d) => {
              const t = txns.find((x) => x.id === d.id);
              return t ? <Link key={d.id} to="/transactions/$id" params={{ id: d.id }} className="flex justify-between rounded-xl border border-border p-2.5 text-sm hover:bg-muted"><span className="truncate">{t.description} · {new Date(t.occurred_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</span><span className="num font-semibold">{formatMoney(t.amount_paise)}</span></Link> : null;
            })}
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="ghost" onClick={async () => { setDupOpen(false); await discardExtraction(ex).catch(() => undefined); await invalidateScans(qc); toast("Import cancelled — nothing was saved"); navigate({ to: "/scan" }); }}>Cancel import</Button>
            <Button onClick={() => { setDupOpen(false); void save(true); }}>Save anyway</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function NotSavableActions({ state, busy, onWait, onRecord, direction }: { state: string; busy: boolean; onWait: () => void; onRecord: (t: TxnType) => void; direction: NormalisedExtraction["direction"] }) {
  if (state === "failed_payment") return (
    <InlineAlert tone="warning" title="Not added to your spending">
      Failed payments aren't recorded. Discard this scan, or if the money did leave your account, <button className="font-semibold text-coral underline" onClick={() => onRecord("expense")}>record it anyway</button>.
    </InlineAlert>
  );
  if (state === "pending_payment" || state === "unpaid_invoice") return (
    <div className="space-y-2">
      <InlineAlert tone="info" title={state === "pending_payment" ? "Waiting for the payment to complete" : "Not paid yet"}>Keep it in your Waiting list and come back when it's done. Nothing is added to your spending.</InlineAlert>
      <div className="flex gap-2">
        <Button variant="soft" className="flex-1" disabled={busy} onClick={onWait}>Keep in Waiting list</Button>
        <Button className="flex-1" onClick={() => onRecord(direction === "received" ? "income" : "expense")}>It's paid — record it</Button>
      </div>
    </div>
  );
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold">Record this as:</p>
      <div className="grid grid-cols-4 gap-1.5">
        {(Object.keys(TXN_TYPE_LABELS) as TxnType[]).map((t) => <Button key={t} size="sm" variant="outline" onClick={() => onRecord(t)}>{TXN_TYPE_LABELS[t]}</Button>)}
      </div>
      <p className="text-xs text-muted-foreground">Or discard it if it isn't a completed transaction.</p>
    </div>
  );
}

function ImageSection({ ex, onChanged }: { ex: Extraction; onChanged: () => Promise<void> }) {
  const img = useQuery(imageUrlQuery(ex.file_path));
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"replace" | "remove" | null>(null);
  const replace = async (file: File | undefined) => {
    if (!file) return;
    setBusy("replace");
    try {
      const p = await prepareImage(file, file.name);
      await replaceExtractionImage(ex, p.blob);
      await invalidateScans(qc);
      if (ex.file_path) await qc.invalidateQueries({ queryKey: scanKeys.image(ex.file_path) });
      toast("Reading the new image…");
      await onChanged();
    } catch (e) { toast.error(e instanceof ImageFileError ? e.message : errorMessage(e)); }
    finally { setBusy(null); }
  };
  return (
    <Card className="space-y-3">
      <SectionTitle title="Original image" />
      {ex.file_path ? (img.data ? <ZoomableImage src={img.data} alt="Scanned document" /> : img.error ? <InlineAlert tone="warning" title="Image couldn't be loaded">{errorMessage(img.error)}</InlineAlert> : <SkeletonBlock className="h-56" />)
        : <p className="rounded-2xl bg-muted/60 p-4 text-sm text-muted-foreground">The image was removed. The values read from it are kept for review.</p>}
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" aria-label="Replace image" onChange={(e) => { void replace(e.target.files?.[0]); e.target.value = ""; }} />
      <div className="flex gap-2">
        <Button variant="soft" size="sm" className="flex-1" disabled={busy !== null} onClick={() => input.current?.click()}>{busy === "replace" ? <Loader2 className="animate-spin" /> : <RefreshCw />}Replace image</Button>
        {ex.file_path && (
          <Button variant="outline" size="sm" className="flex-1" disabled={busy !== null} onClick={async () => {
            setBusy("remove");
            try { await deleteExtractionImage(ex); await invalidateScans(qc); toast.success("Image removed"); } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(null); }
          }}>{busy === "remove" ? <Loader2 className="animate-spin" /> : <Trash2 />}Remove image</Button>
        )}
      </div>
    </Card>
  );
}

function DiscardButton({ ex, onDone }: { ex: Extraction; onDone: () => void }) {
  const qc = useQueryClient();
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild><Button variant="outline" size="lg" className="flex-1"><Trash2 />Discard</Button></AlertDialogTrigger>
      <AlertDialogContent className="rounded-3xl">
        <AlertDialogHeader>
          <AlertDialogTitle>Discard this scan?</AlertDialogTitle>
          <AlertDialogDescription>Nothing will be saved, and the image and what was read from it will be deleted.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="rounded-full">Keep reviewing</AlertDialogCancel>
          <AlertDialogAction className="rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={async () => {
            try { await discardExtraction(ex); await invalidateScans(qc); toast("Scan discarded"); onDone(); } catch (e) { toast.error(errorMessage(e)); }
          }}>Discard</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function Row({ label, value, badge, sub }: { label: string; value: string; badge?: ReactNode; sub?: string | undefined }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right">
        <span className="inline-flex items-center gap-1.5 font-semibold"><span className="break-words">{value}</span>{badge}</span>
        {sub && <span className="block text-xs text-muted-foreground">{sub}</span>}
      </dd>
    </div>
  );
}

function Field({ label, error, badge, hint, children }: { label: string; error?: string | undefined; badge?: ReactNode; hint?: string | undefined; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2"><p className="text-sm font-semibold">{label}</p>{badge}</div>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
      {error && <p className="text-xs font-medium text-destructive">{error}</p>}
    </div>
  );
}

const CHECK_ICON = { ok: CheckCircle2, info: Info, warning: AlertTriangle, error: CircleAlert } as const;
const CHECK_TONE = { ok: "text-income", info: "text-transfer", warning: "text-warning", error: "text-destructive" } as const;
function CheckRow({ check, children }: { check: Check; children?: ReactNode }) {
  const Icon = CHECK_ICON[check.level];
  return (
    <div className="flex gap-2.5 py-1.5 text-sm">
      <Icon className={cn("mt-0.5 size-4 shrink-0", CHECK_TONE[check.level])} />
      <div className="min-w-0"><p className="font-semibold">{check.title}</p>{check.detail && <p className="text-xs text-muted-foreground">{check.detail}</p>}{children}</div>
    </div>
  );
}
