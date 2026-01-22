import { useState, useCallback } from "react";

export function useDialogState() {
  const [previewImage, setPreviewImage] = useState<{ mime_type: string; base64_data: string } | null>(null);

  const openPreview = useCallback((image: { mime_type: string; base64_data: string }) => {
    setPreviewImage(image);
  }, []);

  const closePreview = useCallback(() => {
    setPreviewImage(null);
  }, []);

  return {
    previewImage,
    setPreviewImage,
    openPreview,
    closePreview,
  };
}
