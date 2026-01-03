"use client";

import { useEffect, useState } from "react";
import { ConversationList } from "@/components/conversation-list";
import { ChatView } from "@/components/chat-view";
import { CreateGroupDialog } from "@/components/create-group-dialog";
import { MessageCircle } from "lucide-react";

export default function Home() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<"agent" | "group" | null>(null);
  const [selectedName, setSelectedName] = useState<string>("");
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      const raw = window.localStorage.getItem("cuehub.sidebarCollapsed");
      if (raw === "1") return true;
      if (raw === "0") return false;
    } catch {
      // ignore
    }
    return false;
  });

  useEffect(() => {
    try {
      window.localStorage.setItem("cuehub.sidebarCollapsed", sidebarCollapsed ? "1" : "0");
    } catch {
      // ignore
    }
  }, [sidebarCollapsed]);

  const handleSelect = (id: string, type: "agent" | "group", name: string) => {
    setSelectedId(id);
    setSelectedType(type);
    setSelectedName(name);
  };

  const handleBack = () => {
    setSelectedId(null);
    setSelectedType(null);
  };

  const handleGroupCreated = (groupId: string, groupName: string) => {
    setSelectedId(groupId);
    setSelectedType("group");
    setSelectedName(groupName);
  };

  return (
    <div className="flex h-screen bg-transparent overflow-hidden">
      {/* Desktop: Side by side */}
      <div
        className="hidden md:flex md:h-full md:w-full"
        style={{
          ["--cuehub-sidebar-w" as never]: sidebarCollapsed ? "4rem" : "18rem",
        }}
      >
        <ConversationList
          selectedId={selectedId}
          selectedType={selectedType}
          onSelect={handleSelect}
          onCreateGroup={() => setShowCreateGroup(true)}
          collapsed={sidebarCollapsed}
          onToggleCollapsed={() => setSidebarCollapsed((v) => !v)}
        />
        {selectedId && selectedType ? (
          <ChatView
            type={selectedType}
            id={selectedId}
            name={selectedName}
          />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center text-muted-foreground">
            <MessageCircle className="mb-4 h-16 w-16 opacity-50" />
            <p className="text-lg">Select a conversation to start chatting</p>
            <p className="mt-2 text-sm">Or click + in the top-right to create a group</p>
          </div>
        )}
      </div>

      {/* Mobile: Stack view with smooth transition */}
      <div className="flex h-full w-full flex-col md:hidden">
        {selectedId && selectedType ? (
          <ChatView
            type={selectedType}
            id={selectedId}
            name={selectedName}
            onBack={handleBack}
          />
        ) : (
          <ConversationList
            selectedId={selectedId}
            selectedType={selectedType}
            onSelect={handleSelect}
            onCreateGroup={() => setShowCreateGroup(true)}
          />
        )}
      </div>

      <CreateGroupDialog
        open={showCreateGroup}
        onOpenChange={setShowCreateGroup}
        onCreated={handleGroupCreated}
      />
    </div>
  );
}
