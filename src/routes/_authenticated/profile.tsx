import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ChevronRight, FlaskConical, Landmark, Loader2, LogOut, ScanLine, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, PageHeader, SkeletonBlock } from "@/components/smartfin/ui-bits";
import { supabase } from "@/integrations/supabase/client";
import { errorMessage, profileQuery, qk, updateProfile } from "@/lib/data/queries";
import { clearDemoData, loadDemoData } from "@/lib/data/demo";
import { useFinanceData } from "@/hooks/use-finance-data";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({ meta: [{ title: "Profile — SMARTFIN" }] }),
  component: ProfilePage,
});

function ProfilePage() {
  const { user } = Route.useRouteContext();
  const profile = useQuery(profileQuery);
  const { txns } = useFinanceData();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [timeFormat, setTimeFormat] = useState("12h");
  const [saving, setSaving] = useState(false);
  const [demoBusy, setDemoBusy] = useState(false);
  const hasDemo = txns.some((t) => t.is_demo);

  useEffect(() => { if (profile.data) { setName(profile.data.display_name); setTimeFormat(profile.data.time_format); } return undefined; }, [profile.data]);

  const save = async () => {
    const nm = name.trim();
    if (!nm || nm.length > 60) { toast.error("Name should be 1–60 characters"); return; }
    setSaving(true);
    try { await updateProfile({ display_name: nm, time_format: timeFormat }); await qc.invalidateQueries({ queryKey: qk.profile }); toast.success("Profile saved"); }
    catch (e) { toast.error(errorMessage(e)); } finally { setSaving(false); }
  };

  const demo = async () => {
    setDemoBusy(true);
    try {
      if (hasDemo) { await clearDemoData(); toast.success("Demo records removed"); }
      else { await loadDemoData(); toast.success("Demo records added"); }
      await qc.invalidateQueries();
    } catch (e) { toast.error(errorMessage(e)); } finally { setDemoBusy(false); }
  };

  const signOut = async () => {
    await qc.cancelQueries(); qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", search: {}, replace: true });
  };

  return (
    <div className="space-y-5">
      <PageHeader title="Profile" />
      {profile.isLoading ? <SkeletonBlock className="h-48" /> : (
        <Card className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="grid size-14 place-items-center rounded-full bg-brand-gradient text-xl font-extrabold text-on-brand shadow-brand">{(name[0] ?? "S").toUpperCase()}</span>
            <div className="min-w-0"><p className="truncate font-bold">{profile.data?.display_name || "Your name"}</p><p className="truncate text-sm text-muted-foreground">{user.email}</p></div>
          </div>
          <label className="block space-y-1.5"><span className="text-sm font-semibold">Display name</span><Input value={name} onChange={(e) => setName(e.target.value)} className="h-12 rounded-2xl" /></label>
          <div className="space-y-1.5">
            <span className="text-sm font-semibold">Time format</span>
            <div className="grid grid-cols-2 gap-2">
              {[["12h", "12-hour (09:30 PM)"], ["24h", "24-hour (21:30)"]].map(([v, l]) => (
                <button key={v} onClick={() => setTimeFormat(v!)} className={`h-11 rounded-full border text-sm font-semibold ${timeFormat === v ? "border-coral bg-coral/10 text-coral" : "border-border text-muted-foreground"}`}>{l}</button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            {[["Country", "India"], ["Currency", "₹ INR"], ["Dates", "DD/MM/YYYY"]].map(([k, v]) => (
              <div key={k} className="rounded-2xl bg-muted p-2"><p className="text-muted-foreground">{k}</p><p className="font-bold">{v}</p></div>
            ))}
          </div>
          <Button onClick={save} disabled={saving} className="w-full">{saving && <Loader2 className="animate-spin" />}Save profile</Button>
        </Card>
      )}

      <Card className="divide-y divide-border p-0">
        <Link to="/sources" className="flex items-center gap-3 px-5 py-4"><Landmark className="size-5 text-transfer" /><span className="flex-1 font-semibold">Financial sources</span><ChevronRight className="size-4 text-muted-foreground" /></Link>
        <Link to="/scan" hash="privacy" className="flex items-center gap-3 px-5 py-4"><ScanLine className="size-5 text-coral" /><span className="flex-1"><span className="block font-semibold">Scanned documents & privacy</span><span className="block text-xs text-muted-foreground">Stored images, consent and category rules</span></span><ChevronRight className="size-4 text-muted-foreground" /></Link>
        <button onClick={demo} disabled={demoBusy} className="flex w-full items-center gap-3 px-5 py-4 text-left">
          <FlaskConical className="size-5 text-saffron" />
          <span className="flex-1"><span className="block font-semibold">{hasDemo ? "Remove demo data" : "Load demo data"}</span><span className="block text-xs text-muted-foreground">Sample records are always labelled “Demo”</span></span>
          {demoBusy && <Loader2 className="size-4 animate-spin" />}
        </button>
        <div className="flex items-start gap-3 px-5 py-4 text-sm"><ShieldCheck className="mt-0.5 size-5 text-income" /><p className="text-muted-foreground">Only you can see your records. SMARTFIN never asks for bank passwords, UPI PINs or OTPs.</p></div>
      </Card>

      <Button variant="outline" size="lg" className="w-full" onClick={signOut}><LogOut />Sign out</Button>
    </div>
  );
}
