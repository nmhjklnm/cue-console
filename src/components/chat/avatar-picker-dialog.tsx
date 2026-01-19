"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getAgentEmoji } from "@/lib/utils";
import Image from "next/image";

interface AvatarPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: { kind: "agent" | "group"; id: string } | null;
  titleDisplay: string;
  currentAvatarUrl: string;
  candidates: { seed: string; url: string }[];
  onRandomize: () => void;
  onSelect: (seed: string) => void;
}

export function AvatarPickerDialog({
  open,
  onOpenChange,
  target,
  titleDisplay,
  currentAvatarUrl,
  candidates,
  onRandomize,
  onSelect,
}: AvatarPickerDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg glass-surface glass-noise">
        <DialogHeader>
          <DialogTitle>Avatar</DialogTitle>
        </DialogHeader>
        {target && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="h-14 w-14 rounded-full bg-muted overflow-hidden">
                {currentAvatarUrl ? (
                  <Image
                    src={currentAvatarUrl}
                    alt=""
                    width={56}
                    height={56}
                    unoptimized
                    className="h-full w-full"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xl">
                    {target.kind === "group" ? "👥" : getAgentEmoji(target.id)}
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{titleDisplay}</p>
                <p className="text-xs text-muted-foreground truncate">
                  Click a thumb to apply
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={onRandomize}>
                Random
              </Button>
            </div>

            <div className="max-h-52 overflow-y-auto pr-1">
              <div className="grid grid-cols-5 gap-2">
                {candidates.map((c) => (
                  <button
                    key={c.seed}
                    type="button"
                    className="h-12 w-12 rounded-full bg-muted overflow-hidden hover:ring-2 hover:ring-ring/40"
                    onClick={() => onSelect(c.seed)}
                    title="Apply"
                  >
                    {c.url ? (
                      <Image
                        src={c.url}
                        alt=""
                        width={48}
                        height={48}
                        unoptimized
                        className="h-full w-full"
                      />
                    ) : null}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
