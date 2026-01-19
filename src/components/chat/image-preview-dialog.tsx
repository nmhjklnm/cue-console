"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import Image from "next/image";

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
            <Image
              src={`data:${image.mime_type};base64,${image.base64_data}`}
              alt=""
              width={1200}
              height={800}
              unoptimized
              className="max-h-[70vh] h-auto w-auto rounded-lg"
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
