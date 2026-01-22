import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { GripVertical, CornerUpLeft, Trash2 } from "lucide-react";
import type { QueuedMessage } from "@/components/chat-composer";

interface QueuePanelProps {
  queue: QueuedMessage[];
  removeQueued: (id: string) => void;
  recallQueued: (id: string) => void;
  reorderQueue: (fromIndex: number, toIndex: number) => void;
}

export function QueuePanel({
  queue,
  removeQueued,
  recallQueued,
  reorderQueue,
}: QueuePanelProps) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  if (queue.length === 0) return null;

  return (
    <div className="px-1 pt-1">
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-muted-foreground">
          {queue.length} messages queued
        </p>
      </div>
      <div className="mt-1 max-h-28 overflow-y-auto pr-1">
        <div className="space-y-1">
          {queue.map((q, idx) => {
            const summary = (q.text || "").split(/\r?\n/)[0] || "(empty)";
            const hasImages = (q.images?.length || 0) > 0;
            return (
              <div
                key={q.id}
                className={cn(
                  "flex items-center gap-2 rounded-2xl px-2 py-1",
                  "bg-white/35 ring-1 ring-white/25"
                )}
                draggable
                onDragStart={(e) => {
                  setDragIndex(idx);
                  e.dataTransfer.setData("text/plain", String(idx));
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const raw = e.dataTransfer.getData("text/plain");
                  const from = Number(raw);
                  if (Number.isFinite(from)) reorderQueue(from, idx);
                  setDragIndex(null);
                }}
                onDragEnd={() => setDragIndex(null)}
                data-dragging={dragIndex === idx ? "true" : "false"}
              >
                <span className="text-muted-foreground">
                  <GripVertical className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs">
                    {summary}
                    {hasImages ? "  [img]" : ""}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 rounded-xl hover:bg-white/40"
                  onClick={() => recallQueued(q.id)}
                  title="Recall to input"
                >
                  <CornerUpLeft className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 rounded-xl hover:bg-white/40"
                  onClick={() => removeQueued(q.id)}
                  title="Remove from queue"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
