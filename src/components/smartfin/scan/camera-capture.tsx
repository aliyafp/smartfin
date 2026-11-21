import { useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, Loader2, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { InlineAlert } from "@/components/smartfin/ui-bits";

/**
 * Live camera capture. Camera permission is requested only when this dialog opens
 * (i.e. after the user chose "Camera"). On denial we explain and offer gallery upload.
 */
export function CameraCapture({ open, onOpenChange, onCapture, onUseGallery }: {
  open: boolean; onOpenChange: (o: boolean) => void; onCapture: (file: File) => void; onUseGallery: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [shot, setShot] = useState<{ url: string; file: File } | null>(null);

  const stop = () => { streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null; };

  useEffect(() => {
    if (!open || shot) return undefined;
    let cancelled = false;
    (async () => {
      setError(null);
      if (!navigator.mediaDevices?.getUserMedia) { setError("This browser can't open the camera here. Upload a photo from your gallery instead."); return; }
      setStarting(true);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play().catch(() => undefined); }
      } catch (e) {
        const name = e instanceof DOMException ? e.name : "";
        setError(name === "NotAllowedError" || name === "SecurityError"
          ? "Camera access was blocked. Allow camera access for this site in your browser settings, or upload a photo from your gallery."
          : name === "NotFoundError" || name === "OverconstrainedError" ? "No camera was found on this device. Upload a photo from your gallery instead."
          : "The camera couldn't be started. Upload a photo from your gallery instead.");
      } finally { if (!cancelled) setStarting(false); }
    })();
    return () => { cancelled = true; stop(); };
  }, [open, shot]);

  useEffect(() => () => { if (shot) URL.revokeObjectURL(shot.url); }, [shot]);

  const capture = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const c = document.createElement("canvas");
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext("2d")?.drawImage(v, 0, 0);
    c.toBlob((b) => {
      if (!b) { setError("The photo couldn't be captured. Try again."); return; }
      stop();
      setShot({ url: URL.createObjectURL(b), file: new File([b], `camera-${Date.now()}.jpg`, { type: "image/jpeg" }) });
    }, "image/jpeg", 0.92);
  };

  const close = (o: boolean) => { if (!o) { stop(); setShot(null); setError(null); } onOpenChange(o); };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-md rounded-3xl p-4">
        <DialogHeader>
          <DialogTitle>Take a photo</DialogTitle>
          <DialogDescription>Fit the whole receipt or screen in the frame, flat and in good light.</DialogDescription>
        </DialogHeader>
        {error ? (
          <div className="space-y-3">
            <InlineAlert tone="warning" title="Camera unavailable">{error}</InlineAlert>
            <Button className="w-full" onClick={() => { close(false); onUseGallery(); }}><ImagePlus />Upload from gallery</Button>
          </div>
        ) : shot ? (
          <div className="space-y-3">
            <img src={shot.url} alt="Captured document" className="max-h-[60vh] w-full rounded-2xl object-contain bg-muted" />
            <div className="flex gap-2">
              <Button variant="soft" className="flex-1" onClick={() => setShot(null)}><RotateCcw />Retake</Button>
              <Button className="flex-1" onClick={() => { onCapture(shot.file); close(false); }}>Use photo</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="relative overflow-hidden rounded-2xl bg-plum">
              <video ref={videoRef} playsInline muted className="aspect-[3/4] w-full object-cover" />
              {starting && <div className="absolute inset-0 grid place-items-center text-on-brand"><Loader2 className="size-8 animate-spin" /></div>}
            </div>
            <div className="flex gap-2">
              <Button variant="soft" className="flex-1" onClick={() => close(false)}><X />Cancel</Button>
              <Button className="flex-1" onClick={capture} disabled={starting}><Camera />Capture</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
