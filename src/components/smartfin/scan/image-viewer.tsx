import { useState } from "react";
import { Minus, Plus, ZoomIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** Thumbnail that opens a zoomable full view. */
export function ZoomableImage({ src, alt }: { src: string; alt: string }) {
  const [open, setOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  return (
    <>
      <button type="button" onClick={() => { setZoom(1); setOpen(true); }} className="group relative block w-full overflow-hidden rounded-2xl bg-muted" aria-label="Open image full screen">
        <img src={src} alt={alt} className="max-h-72 w-full object-contain" />
        <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-card/90 px-2.5 py-1 text-xs font-semibold shadow-card"><ZoomIn className="size-3.5" />Zoom</span>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl rounded-3xl p-3">
          <DialogHeader className="px-1">
            <DialogTitle>Original image</DialogTitle>
            <DialogDescription>Compare the values with the document.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[70vh] overflow-auto rounded-2xl bg-muted">
            <img src={src} alt={alt} style={{ width: `${zoom * 100}%`, maxWidth: "none" }} className="block" />
          </div>
          <div className="flex items-center justify-center gap-3">
            <Button size="icon" variant="soft" aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(1, z - 0.5))} disabled={zoom <= 1}><Minus /></Button>
            <span className="num w-14 text-center text-sm font-semibold">{Math.round(zoom * 100)}%</span>
            <Button size="icon" variant="soft" aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(4, z + 0.5))} disabled={zoom >= 4}><Plus /></Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
