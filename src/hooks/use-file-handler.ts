import { useCallback, useEffect } from "react";
import { fileToInlineAttachment } from "@/lib/file-utils";
import { handleError, logError } from "@/lib/error-handler";
import { useInputContext } from "@/contexts/input-context";
import { useUIStateContext } from "@/contexts/ui-state-context";

type InlineAttachment = Awaited<ReturnType<typeof fileToInlineAttachment>>;

interface UseFileHandlerParams {
  inputWrapRef: React.RefObject<HTMLDivElement | null>;
}

export function useFileHandler({ inputWrapRef }: UseFileHandlerParams) {
  const { setImages } = useInputContext();
  const { setNotice } = useUIStateContext();

  const addFiles = useCallback(
    async (files: File[], source: string) => {
      if (!files || files.length === 0) return;

      const failures: string[] = [];
      const results = await Promise.allSettled(
        files.map((file) => fileToInlineAttachment(file))
      );

      const successful = results
        .filter((r) => r.status === "fulfilled")
        .map((r) => (r as PromiseFulfilledResult<InlineAttachment>).value);

      results.forEach((r, i) => {
        if (r.status === "rejected") {
          const error = handleError(r.reason);
          failures.push(error);
          logError(r.reason, `file-upload:${files[i].name}`);
        }
      });

      if (successful.length > 0) {
        setImages((prev) => [...prev, ...successful]);
        
        if (failures.length > 0) {
          setNotice(
            `Added ${successful.length} file(s) from ${source}; ${failures.length} failed`
          );
        } else {
          setNotice(`Added ${successful.length} file(s) from ${source}`);
        }
      } else if (failures.length > 0) {
        setNotice(`Failed to add files: ${failures[0]}`);
      }
    },
    [setImages, setNotice]
  );

  const handleFileInput = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files) return;

      try {
        await addFiles(Array.from(files), "upload");
      } finally {
        e.target.value = "";
      }
    },
    [addFiles]
  );

  const handlePaste = useCallback(
    async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const cd = e.clipboardData;
      if (!cd) return;

      const filesFromItems: File[] = [];
      for (const item of Array.from(cd.items || [])) {
        if (item.kind !== "file") continue;
        const file = item.getAsFile();
        if (file) filesFromItems.push(file);
      }

      const files = filesFromItems.length > 0 ? filesFromItems : Array.from(cd.files || []);
      if (files.length === 0) return;

      e.preventDefault();
      await addFiles(files, "paste");
    },
    [addFiles]
  );

  useEffect(() => {
    const el = inputWrapRef.current;
    if (!el) return;

    const onDragOver = (e: DragEvent) => {
      e.preventDefault();
    };

    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      const files = Array.from(e.dataTransfer?.files || []);
      if (files.length > 0) {
        void addFiles(files, "drop");
      }
    };

    el.addEventListener("dragover", onDragOver);
    el.addEventListener("drop", onDrop);

    return () => {
      el.removeEventListener("dragover", onDragOver);
      el.removeEventListener("drop", onDrop);
    };
  }, [addFiles, inputWrapRef]);

  return {
    handleFileInput,
    handlePaste,
  };
}
