export const IMAGE_MAX_DIM = 1600;
export const IMAGE_COMPRESS_QUALITY = 0.82;
export const IMAGE_COMPRESS_THRESHOLD_BYTES = 1_200_000;

export const readAsDataUrl = (file: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsDataURL(file);
  });

export const fileToImage = (file: File) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image load failed"));
    };
    img.src = url;
  });

export const maybeCompressImageFile = async (file: File) => {
  const inputType = (file.type || "").trim();
  const shouldTryCompress =
    file.size >= IMAGE_COMPRESS_THRESHOLD_BYTES ||
    !inputType.startsWith("image/") ||
    inputType === "image/png";

  if (!shouldTryCompress) return { blob: file as Blob, mime: inputType };

  const img = await fileToImage(file);
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  if (!w || !h) return { blob: file as Blob, mime: inputType };

  const scale = Math.min(1, IMAGE_MAX_DIM / Math.max(w, h));
  const outW = Math.max(1, Math.round(w * scale));
  const outH = Math.max(1, Math.round(h * scale));

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return { blob: file as Blob, mime: inputType };
  ctx.drawImage(img, 0, 0, outW, outH);

  const outMime = inputType === "image/webp" ? "image/webp" : "image/jpeg";
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
      outMime,
      IMAGE_COMPRESS_QUALITY
    );
  });

  if (blob.size >= file.size) return { blob: file as Blob, mime: inputType };
  return { blob, mime: outMime };
};

export const fileToInlineImage = async (file: File) => {
  const { blob, mime } = await maybeCompressImageFile(file);
  const dataUrl = await readAsDataUrl(blob);
  const comma = dataUrl.indexOf(",");
  if (comma < 0) throw new Error("invalid data url");
  const header = dataUrl.slice(0, comma);
  const base64 = dataUrl.slice(comma + 1);
  const m = /data:([^;]+);base64/i.exec(header);
  const rawMime = (m?.[1] || mime || file.type || "").trim();
  const finalMime = rawMime.startsWith("image/") ? rawMime : "image/png";
  if (!base64 || base64.length < 16) throw new Error("empty base64");
  return { mime_type: finalMime, base64_data: base64 };
};

export const fileToInlineAttachment = async (file: File) => {
  const mime = (file.type || "").trim();
  if (mime.startsWith("image/")) {
    const img = await fileToInlineImage(file);
    return { ...img, file_name: file.name || undefined };
  }
  const dataUrl = await readAsDataUrl(file);
  const comma = dataUrl.indexOf(",");
  if (comma < 0) throw new Error("invalid data url");
  const header = dataUrl.slice(0, comma);
  const base64 = dataUrl.slice(comma + 1);
  const m = /data:([^;]+);base64/i.exec(header);
  const finalMime = (m?.[1] || mime || "application/octet-stream").trim();
  if (!base64 || base64.length < 16) throw new Error("empty base64");
  return { mime_type: finalMime, base64_data: base64, file_name: file.name || undefined };
};
