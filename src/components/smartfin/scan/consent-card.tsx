import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/smartfin/ui-bits";
import { grantConsent, scanKeys } from "@/lib/data/scans";
import { errorMessage } from "@/lib/data/queries";

export function ConsentCard() {
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  const agree = async () => {
    setBusy(true);
    try { await grantConsent(); await qc.invalidateQueries({ queryKey: scanKeys.consent }); }
    catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  };
  return (
    <Card className="space-y-4">
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-lavender text-transfer"><ShieldCheck className="size-6" /></span>
        <div>
          <h2 className="text-base font-bold">Before you scan</h2>
          <p className="mt-1 text-sm text-muted-foreground">To read your receipts and payment screenshots, SMARTFIN sends each image securely to Lovable AI.</p>
        </div>
      </div>
      <ul className="space-y-2 text-sm">
        <li>• Images are stored privately in your account and only you can open them.</li>
        <li>• They're deleted when you save or discard a scan, unless you choose to keep a copy.</li>
        <li>• Images are not used to train AI models.</li>
        <li>• Never scan screens showing an OTP, UPI PIN, password or card CVV. SMARTFIN removes them if it sees them.</li>
        <li>• Nothing is added to your records until you review and confirm it.</li>
      </ul>
      <Button size="lg" className="w-full" onClick={agree} disabled={busy}>{busy && <Loader2 className="animate-spin" />}I agree — continue</Button>
      <p className="text-center text-xs text-muted-foreground">You can withdraw this at any time at the bottom of this page.</p>
    </Card>
  );
}
