import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { AlertTriangle, Camera, CheckCircle2, ChevronRight, Clock, FileImage, Images, ImagePlus, Loader2, RefreshCw, ScanLine, ShieldCheck, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Card, InlineAlert, PageHeader, SectionTitle, SkeletonBlock } from "@/components/smartfin/ui-bits";
import { CameraCapture } from "@/components/smartfin/scan/camera-capture";
import { ConsentCard } from "@/components/smartfin/scan/consent-card";
import { categoryRulesQuery, consentQuery, createExtraction, deleteAllScanImages, deleteCategoryRule, deleteExtractionImage, discardExtraction, extractionsQuery, revokeConsent, scanKeys, invalidateScans, type Extraction } from "@/lib/data/scans";
import { errorMessage } from "@/lib/data/queries";
import { extractDocument } from "@/lib/extract/scan.functions";
import { checkImageFile, ImageFileError, MAX_FILES, prepareImage } from "@/lib/extract/image";
import { DOCUMENT_TYPES, type DocumentType } from "@/lib/extract/types";
import { getCategory } from "@/lib/finance/categories";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/scan/")({
  head: () => ({ meta: [
    { title: "Scan & Extract — SMARTFIN" },
    { name: "description", content: "Turn receipts, bills and UPI payment screenshots into reviewed SMARTFIN transactions." },
  ] }),
  component: ScanPage,
});

type Stage = "ready" | "checking" | "uploading" | "reading" | "done" | "failed";
interface QueueItem { key: string; file: File; url: string; stage: Stage; error?: string | undefined; extractionId?: string | undefined }

const STAGE_LABEL: Record<Stage, string> = {
  ready: "Ready", checking: "Checking image…", uploading: "Uploading securely…", reading: "Reading document…", done: "Ready to review", failed: "Couldn't read",
};

function ScanPage() {
  const consent = useQuery(consentQuery);
  const list = useQuery(extractionsQuery);
  const qc = useQueryClient();
  const runExtract = useServerFn(extractDocument);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [camera, setCamera] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);
  const single = useRef<HTMLInputElement>(null);
  const multi = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLInputElement>(null);
  const replaceKey = useRef<string | null>(null);
  const urls = useRef(new Set<string>());

  useEffect(() => () => { urls.current.forEach((u) => URL.revokeObjectURL(u)); }, []);

  const makeItem = (file: File): QueueItem => {
    const url = URL.createObjectURL(file); urls.current.add(url);
    return { key: crypto.randomUUID(), file, url, stage: "ready" };
  };
  const patch = (key: string, p: Partial<QueueItem>) => setQueue((q) => q.map((i) => (i.key === key ? { ...i, ...p } : i)));

  const add = (files: FileList | File[] | null) => {
    setPickError(null);
    if (!files) return;
    const arr = Array.from(files);
    const room = MAX_FILES - queue.filter((i) => i.stage !== "done").length;
    const problems: string[] = [];
    const ok: QueueItem[] = [];
    for (const f of arr) {
      const p = checkImageFile(f);
      if (p) problems.push(`${f.name}: ${p.message}`);
      else if (ok.length < room) ok.push(makeItem(f));
      else problems.push(`${f.name}: you can add up to ${MAX_FILES} images at a time.`);
    }
    if (problems.length) setPickError(problems.join(" "));
    setQueue((q) => [...q, ...ok]);
  };

  const replace = (file: File | undefined) => {
    const key = replaceKey.current; replaceKey.current = null;
    if (!file || !key) return;
    const p = checkImageFile(file);
    if (p) { setPickError(p.message); return; }
    const url = URL.createObjectURL(file); urls.current.add(url);
    patch(key, { file, url, stage: "ready", error: undefined, extractionId: undefined });
  };

  const processOne = async (item: QueueItem, batchId: string) => {
    let extractionId = item.extractionId;
    try {
      if (!extractionId) {
        patch(item.key, { stage: "checking", error: undefined });
        const prepared = await prepareImage(item.file, item.file.name);
        patch(item.key, { stage: "uploading" });
        extractionId = await createExtraction(prepared.blob, item.file.name, batchId);
        patch(item.key, { extractionId });
      }
      patch(item.key, { stage: "reading" });
      const res = await runExtract({ data: { extractionId } });
      if (res.ok) patch(item.key, { stage: "done" });
      else patch(item.key, { stage: "failed", error: res.message });
    } catch (e) {
      const msg = e instanceof ImageFileError ? e.message
        : e instanceof TypeError ? "Connection lost while reading. Check your internet and retry." : errorMessage(e);
      patch(item.key, { stage: "failed", error: msg });
    }
  };

  const processAll = async () => {
    setBusy(true);
    const batchId = crypto.randomUUID();
    // One at a time keeps each image's result separate and stays within rate limits.
    for (const item of queue.filter((i) => i.stage === "ready" || i.stage === "failed")) await processOne(item, batchId);
    await qc.invalidateQueries({ queryKey: scanKeys.list });
    setBusy(false);
  };

  if (consent.isLoading) return <div><PageHeader title="Scan & Extract" back="/transactions/new" /><SkeletonBlock className="h-80" /></div>;
  if (consent.error) return <div><PageHeader title="Scan & Extract" back="/transactions/new" /><InlineAlert tone="error" title="Couldn't load">{errorMessage(consent.error)}</InlineAlert></div>;

  const pending = queue.filter((i) => i.stage === "ready" || i.stage === "failed").length;
  const all = list.data ?? [];
  const inProgress = all.filter((e) => ["uploaded", "processing", "extracted", "failed"].includes(e.processing_status) && !queue.some((q) => q.extractionId === e.id));
  const waiting = all.filter((e) => e.processing_status === "waiting");
  const stored = all.filter((e) => e.file_path);

  return (
    <div className="space-y-5">
      <PageHeader title="Scan & Extract" subtitle="Receipts, bills and payment screenshots" back="/transactions/new" />
      {!consent.data ? <ConsentCard /> : (
        <>
          <Card className="space-y-4">
            <SectionTitle title="Add documents" />
            <div className="grid grid-cols-3 gap-2">
              <SourceTile icon={<ImagePlus className="size-6" />} label="Gallery" hint="One image" onClick={() => single.current?.click()} disabled={busy} />
              <SourceTile icon={<Camera className="size-6" />} label="Camera" hint="Take a photo" onClick={() => setCamera(true)} disabled={busy} />
              <SourceTile icon={<Images className="size-6" />} label="Several" hint={`Up to ${MAX_FILES}`} onClick={() => multi.current?.click()} disabled={busy} />
            </div>
            <input ref={single} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" aria-label="Choose an image" onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
            <input ref={multi} type="file" multiple accept="image/jpeg,image/png,image/webp" className="sr-only" aria-label="Choose several images" onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
            <input ref={replaceRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" aria-label="Replace image" onChange={(e) => { replace(e.target.files?.[0]); e.target.value = ""; }} />
            <p className="text-xs text-muted-foreground">JPG, PNG or WebP, up to 10 MB each. Each image is read separately and becomes its own record.</p>
            {pickError && <InlineAlert tone="warning" title="Some files weren't added">{pickError}</InlineAlert>}
          </Card>

          {queue.length > 0 && (
            <Card className="space-y-3">
              <SectionTitle title="Selected images" action={!busy && <button className="text-xs font-semibold text-muted-foreground" onClick={() => setQueue((q) => q.filter((i) => i.stage === "done"))}>Clear</button>} />
              <ul className="space-y-2">
                {queue.map((item) => (
                  <li key={item.key} className="flex items-center gap-3 rounded-2xl border border-border/70 p-2">
                    <img src={item.url} alt="" className="size-16 shrink-0 rounded-xl bg-muted object-cover" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{item.file.name}</p>
                      <p className={cn("flex items-center gap-1 text-xs", item.stage === "failed" ? "text-destructive" : item.stage === "done" ? "text-income" : "text-muted-foreground")}>
                        {["checking", "uploading", "reading"].includes(item.stage) && <Loader2 className="size-3 animate-spin" />}
                        {item.stage === "done" && <CheckCircle2 className="size-3" />}
                        {STAGE_LABEL[item.stage]}
                      </p>
                      {item.error && <p className="text-xs text-muted-foreground">{item.error}</p>}
                    </div>
                    {item.stage === "done" && item.extractionId ? (
                      <Button asChild size="sm"><Link to="/scan/$id" params={{ id: item.extractionId }}>Review</Link></Button>
                    ) : (item.stage === "ready" || item.stage === "failed") && !busy ? (
                      <div className="flex flex-col gap-1">
                        {!item.extractionId && <button className="text-xs font-semibold text-coral" onClick={() => { replaceKey.current = item.key; replaceRef.current?.click(); }}>Replace</button>}
                        <button className="text-xs font-semibold text-muted-foreground" aria-label={`Remove ${item.file.name}`} onClick={async () => {
                          if (item.extractionId) { const ex = all.find((e) => e.id === item.extractionId); if (ex) await discardExtraction(ex).catch(() => undefined); await qc.invalidateQueries({ queryKey: scanKeys.list }); }
                          setQueue((q) => q.filter((i) => i.key !== item.key));
                        }}>Remove</button>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
              {pending > 0 && (
                <Button size="lg" className="w-full" onClick={processAll} disabled={busy}>
                  {busy ? <Loader2 className="animate-spin" /> : <ScanLine />}
                  {busy ? "Reading…" : `Read ${pending} document${pending > 1 ? "s" : ""}`}
                </Button>
              )}
              {busy && <p className="text-center text-xs text-muted-foreground">Each document can take up to a minute. Keep this page open.</p>}
            </Card>
          )}

          <ScanList title="Ready to review / unfinished" items={inProgress} empty={queue.length === 0 ? "No unfinished scans." : null} onRetry={async (id) => {
            const res = await runExtract({ data: { extractionId: id } }).catch(() => ({ ok: false as const, message: "Connection lost. Try again." }));
            await qc.invalidateQueries({ queryKey: scanKeys.list });
            if (res.ok) toast.success("Document read — ready to review"); else toast.error(res.message);
          }} />
          <ScanList title="Waiting (pending or unpaid)" items={waiting} empty={null} />
          <PrivacyCard stored={stored} consentDate={consent.data.granted_at} />
        </>
      )}
      <CameraCapture open={camera} onOpenChange={setCamera} onCapture={(f) => add([f])} onUseGallery={() => single.current?.click()} />
    </div>
  );
}

function SourceTile({ icon, label, hint, onClick, disabled }: { icon: ReactNode; label: string; hint: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="flex flex-col items-center gap-1.5 rounded-2xl border-2 border-dashed border-border bg-muted/40 px-2 py-4 text-center transition-colors hover:border-coral/60 disabled:opacity-50">
      <span className="text-coral">{icon}</span>
      <span className="text-sm font-bold">{label}</span>
      <span className="text-[11px] text-muted-foreground">{hint}</span>
    </button>
  );
}

const STATUS_LABEL: Record<string, string> = { uploaded: "Not read yet", processing: "Reading…", extracted: "Ready to review", failed: "Couldn't read", waiting: "Waiting" };

function ScanList({ title, items, empty, onRetry }: { title: string; items: Extraction[]; empty: string | null; onRetry?: (id: string) => Promise<void> }) {
  const [retrying, setRetrying] = useState<string | null>(null);
  const qc = useQueryClient();
  if (!items.length && !empty) return null;
  return (
    <Card className="space-y-2">
      <SectionTitle title={title} />
      {!items.length ? <p className="text-sm text-muted-foreground">{empty}</p> : (
        <ul className="divide-y divide-border">
          {items.map((e) => {
            const docLabel = e.user_document_type ?? e.document_type;
            const state = (e.interpretation as { state?: string } | null)?.state;
            return (
              <li key={e.id} className="flex items-center gap-3 py-2.5">
                <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", e.processing_status === "failed" ? "bg-destructive/10 text-destructive" : e.processing_status === "waiting" ? "bg-saffron/25 text-plum" : "bg-lavender text-transfer")}>
                  {e.processing_status === "failed" ? <AlertTriangle className="size-5" /> : e.processing_status === "waiting" ? <Clock className="size-5" /> : <FileImage className="size-5" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{docLabel ? DOCUMENT_TYPES[docLabel as DocumentType]?.label ?? "Document" : e.file_name ?? "Document"}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {STATUS_LABEL[e.processing_status] ?? e.processing_status}
                    {state === "pending_payment" ? " · pending payment" : state === "unpaid_invoice" ? " · unpaid bill" : ""}
                    {" · "}{new Date(e.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                  </p>
                </div>
                {e.processing_status === "failed" || e.processing_status === "uploaded" ? (
                  <div className="flex gap-1">
                    {onRetry && e.file_path && <Button size="sm" variant="soft" disabled={retrying === e.id} onClick={async () => { setRetrying(e.id); await onRetry(e.id); setRetrying(null); }}>{retrying === e.id ? <Loader2 className="animate-spin" /> : <RefreshCw />}Retry</Button>}
                    <Button size="icon" variant="ghost" aria-label="Discard" onClick={async () => { try { await discardExtraction(e); await qc.invalidateQueries({ queryKey: scanKeys.list }); toast.success("Scan discarded"); } catch (err) { toast.error(errorMessage(err)); } }}><X /></Button>
                  </div>
                ) : e.processing_status === "processing" ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : (
                  <Link to="/scan/$id" params={{ id: e.id }} className="flex items-center text-sm font-semibold text-coral">Open<ChevronRight className="size-4" /></Link>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function PrivacyCard({ stored, consentDate }: { stored: Extraction[]; consentDate: string }) {
  const qc = useQueryClient();
  const rules = useQuery(categoryRulesQuery);
  const [busy, setBusy] = useState(false);
  const kept = stored.filter((e) => e.processing_status === "confirmed");
  return (
    <Card className="space-y-4" >
      <div id="privacy" className="flex items-center gap-2"><ShieldCheck className="size-5 text-transfer" /><h2 className="text-base font-bold">Privacy & stored images</h2></div>
      <p className="text-sm text-muted-foreground">
        You agreed to image reading by Lovable AI on {new Date(consentDate).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}.
        {" "}{stored.length ? `${stored.length} image${stored.length > 1 ? "s are" : " is"} stored privately (${kept.length} kept with saved transactions, ${stored.length - kept.length} on unfinished scans).` : "No images are stored."}
      </p>
      {kept.length > 0 && (
        <ul className="space-y-1.5">
          {kept.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="truncate">{e.file_name ?? "Image"} · {new Date(e.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</span>
              <button className="flex items-center gap-1 text-xs font-semibold text-destructive" onClick={async () => { try { await deleteExtractionImage(e); await qc.invalidateQueries({ queryKey: scanKeys.list }); toast.success("Image deleted"); } catch (err) { toast.error(errorMessage(err)); } }}><Trash2 className="size-3.5" />Delete</button>
            </li>
          ))}
        </ul>
      )}
      {(rules.data?.length ?? 0) > 0 && (
        <div className="space-y-1.5">
          <p className="text-sm font-semibold">Your category rules</p>
          {rules.data!.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="truncate">{r.match_field === "merchant" ? "Merchant" : "Item"} contains “{r.pattern}” → {getCategory(r.category).label}</span>
              <button className="text-xs font-semibold text-muted-foreground" aria-label={`Delete rule ${r.pattern}`} onClick={async () => { await deleteCategoryRule(r.id).catch((err) => toast.error(errorMessage(err))); await qc.invalidateQueries({ queryKey: scanKeys.rules }); }}><X className="size-4" /></button>
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {stored.length > 0 && (
          <ConfirmButton label="Delete all stored images" title="Delete all stored images?" body="Every scan image in your account will be permanently deleted. Saved transactions and their items stay." busy={busy} onConfirm={async () => {
            setBusy(true);
            try { await deleteAllScanImages(stored); toast.success("All stored images deleted"); } catch (err) { toast.error(errorMessage(err)); }
            finally { await qc.invalidateQueries({ queryKey: scanKeys.list }); setBusy(false); }
          }} />
        )}
        <ConfirmButton label="Withdraw consent" title="Stop image reading?" body="SMARTFIN will stop sending images to Lovable AI. Your saved transactions stay. You can agree again later to scan." busy={busy} onConfirm={async () => {
          try { await revokeConsent(); await qc.invalidateQueries({ queryKey: scanKeys.consent }); toast.success("Consent withdrawn"); } catch (err) { toast.error(errorMessage(err)); }
        }} />
      </div>
      {stored.length === 0 && <EmptyNote />}
    </Card>
  );
}

function EmptyNote() { return <p className="text-xs text-muted-foreground">Images are deleted automatically when you save or discard a scan, unless you tick “Keep a copy”.</p>; }

function ConfirmButton({ label, title, body, onConfirm, busy }: { label: string; title: string; body: string; onConfirm: () => Promise<void>; busy?: boolean }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild><Button variant="outline" size="sm" disabled={busy}>{label}</Button></AlertDialogTrigger>
      <AlertDialogContent className="rounded-3xl">
        <AlertDialogHeader><AlertDialogTitle>{title}</AlertDialogTitle><AlertDialogDescription>{body}</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="rounded-full">Cancel</AlertDialogCancel>
          <AlertDialogAction className="rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => void onConfirm()}>Confirm</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

