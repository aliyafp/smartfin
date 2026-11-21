import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Wordmark } from "@/components/smartfin/logo";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Set a new password — SMARTFIN" },
      { name: "description", content: "Choose a new password for your SMARTFIN account." },
      { property: "og:title", content: "Set a new password — SMARTFIN" },
      { property: "og:description", content: "Reset your SMARTFIN password securely." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPassword,
});

function ResetPassword() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const isRecovery = window.location.hash.includes("type=recovery");
    const { data } = supabase.auth.onAuthStateChange((event) => { if (event === "PASSWORD_RECOVERY") setReady(true); });
    supabase.auth.getSession().then(({ data: s }) => { if (s.session && isRecovery) setReady(true); else if (s.session) setReady(true); });
    return () => data.subscription.unsubscribe();
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (pw.length < 8) return setErr("Use at least 8 characters");
    if (pw !== pw2) return setErr("Passwords don't match");
    setErr(""); setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Password updated");
    navigate({ to: "/home", replace: true });
  };

  return (
    <div className="mx-auto min-h-dvh max-w-md bg-soft-glow bg-no-repeat px-6 pt-8">
      <Wordmark />
      <h1 className="mt-10 text-3xl font-extrabold tracking-tight">Set a new password</h1>
      {!ready ? (
        <p className="mt-3 text-muted-foreground">Open this page from the reset link in your email. If the link expired, request a new one from the sign-in screen.</p>
      ) : (
        <form onSubmit={submit} className="mt-7 space-y-4">
          <div className="space-y-1.5"><Label htmlFor="pw">New password</Label><Input id="pw" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} className="h-12 rounded-2xl bg-card" /></div>
          <div className="space-y-1.5"><Label htmlFor="pw2">Confirm password</Label><Input id="pw2" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} className="h-12 rounded-2xl bg-card" /></div>
          {err && <p className="text-sm font-medium text-destructive">{err}</p>}
          <Button type="submit" size="lg" className="w-full" disabled={busy}>{busy && <Loader2 className="animate-spin" />}Update password</Button>
        </form>
      )}
    </div>
  );
}
