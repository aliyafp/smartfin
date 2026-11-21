import type React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Wordmark } from "@/components/smartfin/logo";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";

const searchSchema = z.object({ redirect: z.string().optional() });

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Sign in — SMARTFIN" },
      { name: "description", content: "Sign in or create your SMARTFIN account." },
      { property: "og:title", content: "Sign in — SMARTFIN" },
      { property: "og:description", content: "Access your SMARTFIN finance records securely." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

const emailSchema = z.string().trim().email("Enter a valid email address").max(255);
const passwordSchema = z.string().min(8, "Use at least 8 characters").max(72);
const nameSchema = z.string().trim().min(1, "Tell us your name").max(60);

type Mode = "signin" | "signup" | "forgot";

function safePath(p?: string) {
  if (!p) return "/home";
  try {
    const u = new URL(p, window.location.origin);
    return u.origin === window.location.origin ? u.pathname + u.search : "/home";
  } catch { return "/home"; }
}

function AuthPage() {
  const { redirect } = Route.useSearch();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Partial<Record<"email" | "password" | "name", string>>>({});
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const errs: Partial<Record<"email" | "password" | "name", string>> = {};
    const em = emailSchema.safeParse(email);
    if (!em.success) errs.email = em.error.issues[0]?.message ?? "Invalid value";
    if (mode !== "forgot") {
      const pw = passwordSchema.safeParse(password);
      if (!pw.success) errs.password = pw.error.issues[0]?.message ?? "Invalid value";
    }
    if (mode === "signup") {
      const nm = nameSchema.safeParse(name);
      if (!nm.success) errs.name = nm.error.issues[0]?.message ?? "Invalid value";
    }
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setBusy(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        navigate({ to: safePath(redirect), replace: true });
      } else if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(), password,
          options: { emailRedirectTo: window.location.origin + "/home", data: { display_name: name.trim() } },
        });
        if (error) throw error;
        if (data.session) navigate({ to: "/home", replace: true });
        else setSentTo(email.trim());
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/reset-password` });
        if (error) throw error;
        setSentTo(email.trim());
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      toast.error(msg === "Invalid login credentials" ? "Email or password is incorrect." : msg);
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (result.error) { toast.error("Google sign-in didn't complete. Please try again."); return; }
    if (result.redirected) return;
    navigate({ to: safePath(redirect), replace: true });
  };

  if (sentTo) {
    return (
      <Shell>
        <div className="rounded-3xl bg-card p-6 text-center shadow-card animate-rise">
          <div className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-turquoise/20 text-income"><MailCheck className="size-7" /></div>
          <h1 className="text-xl font-extrabold">Check your inbox</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {mode === "forgot" ? "We sent a password reset link to " : "We sent a confirmation link to "}
            <span className="font-semibold text-foreground">{sentTo}</span>.
          </p>
          <Button variant="soft" className="mt-6" onClick={() => { setSentTo(null); setMode("signin"); }}>Back to sign in</Button>
        </div>
      </Shell>
    );
  }

  const titles: Record<Mode, [string, string]> = {
    signin: ["Welcome back", "Sign in to see your recorded finances."],
    signup: ["Create your account", "Start organising your money in ₹."],
    forgot: ["Reset password", "We'll email you a secure reset link."],
  };

  return (
    <Shell>
      <div className="animate-rise">
        <h1 className="text-3xl font-extrabold tracking-tight">{titles[mode][0]}</h1>
        <p className="mt-1 text-muted-foreground">{titles[mode][1]}</p>

        <form onSubmit={submit} noValidate className="mt-7 space-y-4">
          {mode === "signup" && (
            <Field id="name" label="Your name" error={errors.name}>
              <Input id="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} className="h-12 rounded-2xl bg-card" />
            </Field>
          )}
          <Field id="email" label="Email" error={errors.email}>
            <Input id="email" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-12 rounded-2xl bg-card" />
          </Field>
          {mode !== "forgot" && (
            <Field id="password" label="Password" error={errors.password}>
              <Input id="password" type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)} className="h-12 rounded-2xl bg-card" />
            </Field>
          )}
          {mode === "signin" && (
            <button type="button" onClick={() => setMode("forgot")} className="text-sm font-semibold text-coral">Forgot password?</button>
          )}
          <Button type="submit" size="lg" className="w-full" disabled={busy}>
            {busy && <Loader2 className="animate-spin" />}
            {mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Send reset link"}
          </Button>
        </form>

        {mode !== "forgot" && (
          <>
            <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" />or<span className="h-px flex-1 bg-border" /></div>
            <button type="button" onClick={google} className="flex h-12 w-full items-center justify-center gap-2.5 rounded-full border border-[#747775] bg-[#FFFFFF] px-3 text-sm font-medium text-[#1F1F1F] transition-transform active:scale-[0.98]">
              <svg aria-hidden="true" width="18" height="18" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"/><path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"/><path fill="#FBBC05" d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"/><path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"/></svg>
              Continue with Google
            </button>
          </>
        )}

        <p className="mt-8 text-center text-sm text-muted-foreground">
          {mode === "signup" ? "Already have an account? " : mode === "signin" ? "New to SMARTFIN? " : "Remembered it? "}
          <button type="button" className="font-semibold text-coral" onClick={() => { setErrors({}); setMode(mode === "signin" ? "signup" : "signin"); }}>
            {mode === "signin" ? "Create an account" : "Sign in"}
          </button>
        </p>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-soft-glow bg-no-repeat px-6 pt-safe pb-safe">
      <div className="pt-8 pb-10"><Wordmark /></div>
      {children}
      <p className="mt-auto pt-10 pb-6 text-center text-xs text-muted-foreground">SMARTFIN will never ask for your bank password, UPI PIN or OTP.</p>
    </div>
  );
}

function Field({ id, label, error, children }: { id: string; label: string; error?: string | undefined; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="font-semibold">{label}</Label>
      {children}
      {error && <p className="text-xs font-medium text-destructive">{error}</p>}
    </div>
  );
}
