"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ImagePreviewDialogProps {
  image: { mime_type: string; base64_data: string } | null;
  onClose: () => void;
}

export function ImagePreviewDialog({ image, onClose }: ImagePreviewDialogProps) {
  return (
    <Dialog open={!!image} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl glass-surface glass-noise">
        <DialogHeader>
          <DialogTitle>Preview</DialogTitle>
        </DialogHeader>
        {image && (
          <div className="flex items-center justify-center">
            <img
              src={`data:${image.mime_type};base64,${image.base64_data}`}
              alt=""
              className="max-h-[70vh] rounded-lg"
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
