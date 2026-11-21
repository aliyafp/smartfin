import { CheckCircle2, CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, InlineAlert, NativeSelect, SectionTitle } from "@/components/smartfin/ui-bits";
import { FIELD_LABELS, mappingProblems, parseStatementDate, type DateOrder, type Field, type Mapping } from "@/lib/import/statement";
import type { LoadedFile } from "./upload-step";

const FIELDS: { field: Field; required?: boolean; note?: string }[] = [
  { field: "date", required: true },
  { field: "time" },
  { field: "description", required: true, note: "Or a merchant column" },
  { field: "merchant" },
  { field: "debit", note: "Use Debit + Credit, or one Amount column" },
  { field: "credit" },
  { field: "amount" },
  { field: "type", note: "Needed when one Amount column has no + / − signs" },
  { field: "reference" },
  { field: "account", note: "Shown for checking; not saved" },
];

const ORDER_LABELS: [DateOrder, string][] = [["dmy", "Day first — 25/11/2026"], ["mdy", "Month first — 11/25/2026"], ["ymd", "Year first — 2026-11-25"]];

export function MapStep({ file, mapping, setMapping, dateOrder, setDateOrder, onBack, onNext }: {
  file: LoadedFile; mapping: Mapping; setMapping: (m: Mapping) => void; dateOrder: DateOrder; setDateOrder: (o: DateOrder) => void; onBack: () => void; onNext: () => void;
}) {
  const problems = mappingProblems(mapping);
  const sample = file.rows.find((r) => Object.values(r).some(Boolean)) ?? {};
  const set = (f: Field, header: string) => {
    const next: Mapping = { ...mapping };
    if (header) next[f] = header; else delete next[f];
    setMapping(next);
  };
  const sampleDate = mapping.date ? parseStatementDate(sample[mapping.date] ?? "", dateOrder, mapping.time ? sample[mapping.time] ?? "" : "") : null;
  const detected = Object.keys(mapping).length;

  return (
    <div className="space-y-5">
      <InlineAlert tone={problems.length ? "warning" : "info"} icon={problems.length ? <CircleAlert className="size-4" /> : <CheckCircle2 className="size-4 text-income" />}
        title={problems.length ? "A few columns need your help" : `We matched ${detected} column${detected === 1 ? "" : "s"} automatically`}>
        {problems.length ? <ul className="list-disc space-y-0.5 pl-4">{problems.map((p) => <li key={p}>{p}</li>)}</ul> : "Check them below. Different banks name columns differently, so you can change any match."}
      </InlineAlert>

      <Card className="space-y-4">
        <SectionTitle title="Match your columns" />
        {FIELDS.map(({ field, required, note }) => {
          const header = mapping[field] ?? "";
          const example = header ? sample[header] : "";
          return (
            <div key={field} className="space-y-1">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm font-semibold">{FIELD_LABELS[field]}{required && <span className="text-coral"> *</span>}</p>
                {note && <p className="text-right text-[11px] text-muted-foreground">{note}</p>}
              </div>
              <NativeSelect label={FIELD_LABELS[field]} value={header} onChange={(h) => set(field, h)} placeholder="Not in this file" options={file.headers.map((h) => [h, h])} />
              {header && <p className="truncate text-xs text-muted-foreground">First row: <span className="font-medium text-foreground">{example || "(empty)"}</span></p>}
            </div>
          );
        })}
      </Card>

      <Card className="space-y-2">
        <SectionTitle title="Date format" />
        <NativeSelect label="Date format" value={dateOrder} onChange={(v) => setDateOrder(v as DateOrder)} options={ORDER_LABELS} />
        {mapping.date && (
          <p className="text-xs text-muted-foreground">
            “{sample[mapping.date] ?? ""}” reads as{" "}
            {sampleDate ? <span className="font-semibold text-foreground">{sampleDate.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</span> : <span className="font-semibold text-destructive">an unrecognised date</span>}
          </p>
        )}
        <p className="text-xs text-muted-foreground">Dates with month names, like 05 Nov 2026, are read automatically.</p>
      </Card>

      <div className="flex gap-3">
        <Button variant="soft" size="lg" className="flex-1" onClick={onBack}>Back</Button>
        <Button size="lg" className="flex-1" disabled={problems.length > 0} onClick={onNext}>Check transactions</Button>
      </div>
    </div>
  );
}
