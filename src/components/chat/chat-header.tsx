"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn, getAgentEmoji } from "@/lib/utils";
import { ChevronLeft, Github } from "lucide-react";

interface ChatHeaderProps {
  type: "agent" | "group";
  id: string;
  titleDisplay: string;
  avatarUrl: string;
  members: string[];
  onBack?: () => void;
  onAvatarClick: () => void;
  onTitleChange: (newTitle: string) => Promise<void>;
}

export function ChatHeader({
  type,
  id,
  titleDisplay,
  avatarUrl,
  members,
  onBack,
  onAvatarClick,
  onTitleChange,
}: ChatHeaderProps) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");

  const beginEditTitle = () => {
    setEditingTitle(true);
    setTitleDraft(titleDisplay);
    setTimeout(() => {
      const el = document.getElementById("chat-title-input");
      if (el instanceof HTMLInputElement) el.focus();
    }, 0);
  };

  const commitEditTitle = async () => {
    const next = titleDraft.trim();
    setEditingTitle(false);
    if (!next || next === titleDisplay) return;
    await onTitleChange(next);
  };

  return (
    <div className={cn("px-4 pt-4")}>
      <div
        className={cn(
          "mx-auto flex w-full max-w-230 items-center gap-2 rounded-3xl p-3",
          "glass-surface glass-noise"
        )}
      >
        {onBack && (
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
        )}
        <button
          type="button"
          className="h-9 w-9 shrink-0 rounded-full bg-muted overflow-hidden"
          onClick={onAvatarClick}
          title="Change avatar"
        >
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="h-full w-full" />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-lg">
              {type === "group" ? "👥" : getAgentEmoji(id)}
            </span>
          )}
        </button>
        <div className="flex-1 min-w-0">
          {editingTitle ? (
            <input
              id="chat-title-input"
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void commitEditTitle();
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  setEditingTitle(false);
                }
              }}
              onBlur={() => {
                void commitEditTitle();
              }}
              className="w-60 max-w-full rounded-xl border border-white/45 bg-white/55 px-2.5 py-1.5 text-sm font-semibold outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]"
            />
          ) : (
            <h2
              className={cn("font-semibold", "cursor-text", "truncate")}
              onDoubleClick={beginEditTitle}
              title="Double-click to rename"
            >
              {titleDisplay}
            </h2>
          )}
          {type === "group" && members.length > 0 && (
            <p className="text-xs text-muted-foreground truncate">
              {members.length} member{members.length === 1 ? "" : "s"}
            </p>
          )}
        </div>
        <Button variant="ghost" size="icon" asChild>
          <a
            href="https://github.com/nmhjklnm/cue-console"
            target="_blank"
            rel="noreferrer"
            title="https://github.com/nmhjklnm/cue-console"
          >
            <Github className="h-5 w-5" />
          </a>
        </Button>
        {type === "group" && (
          <span
            className="hidden sm:inline text-[11px] text-muted-foreground select-none mr-1"
            title="Type @ to mention members"
          >
            @ mention
          </span>
        )}
      </div>
    </div>
  );
}
