import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

interface UndoToastProps {
  pendingDelete: string[];
  undoToastKey: number;
  onUndo: () => void;
  onDismiss: () => void;
}

export function UndoToast({ pendingDelete, undoToastKey, onUndo, onDismiss }: UndoToastProps) {
  if (pendingDelete.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 w-65 overflow-hidden rounded-xl border bg-white/85 p-3 text-xs shadow-xl backdrop-blur">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium">Deleted</div>
          <div className="text-muted-foreground">
            {pendingDelete.length} conversation(s) will be removed in 5s
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onDismiss}
          title="Dismiss"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="mt-2 flex justify-end gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="h-8 rounded-md px-2 text-xs"
          onClick={onUndo}
        >
          Undo
        </Button>
      </div>

      <div
        key={undoToastKey}
        className="absolute bottom-0 left-0 right-0 h-1 bg-black/10"
      >
        <div
          className="h-full bg-primary origin-left"
          style={{
            transform: "scaleX(1)",
            animation: "cuehub-toast-progress 5s linear forwards",
          }}
        />
      </div>

      <style>{`@keyframes cuehub-toast-progress { from { transform: scaleX(1); } to { transform: scaleX(0); } }`}</style>
    </div>
  );
}
