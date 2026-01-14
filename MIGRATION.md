# 迁移到新架构指南

## 概述

本指南说明如何将现有的 ChatView 组件迁移到新的工程化架构。

## 迁移步骤

### 1. 包裹组件使用 ChatProvider

**旧代码：**
```tsx
export function ChatView({ type, id, name, onBack }: ChatViewProps) {
  const [input, setInput] = useState("");
  const [images, setImages] = useState([]);
  // ... 更多状态
}
```

**新代码：**
```tsx
export function ChatView({ type, id, name, onBack }: ChatViewProps) {
  return (
    <ChatProvider>
      <ChatViewContent type={type} id={id} name={name} onBack={onBack} />
    </ChatProvider>
  );
}

function ChatViewContent({ type, id, name, onBack }: ChatViewProps) {
  const { input, images, busy, error, notice, setInput, setImages } = useChatContext();
  // ... 组件逻辑
}
```

### 2. 替换状态管理

**旧代码：**
```tsx
const [input, setInput] = useState("");
const [images, setImages] = useState([]);
const [busy, setBusy] = useState(false);
const [error, setError] = useState<string | null>(null);
```

**新代码：**
```tsx
const { 
  input, 
  images, 
  busy, 
  error, 
  setInput, 
  setImages, 
  setBusy, 
  setError,
  clearInput 
} = useChatContext();
```

### 3. 替换消息发送逻辑

**旧代码：**
```tsx
const { handleSend, handleSubmitConfirm, handleCancel, handleReply } = useMessageActions(
  type,
  input,
  setInput,
  images,
  setImages,
  draftMentions,
  setDraftMentions,
  busy,
  setBusy,
  setError,
  pendingRequests,
  imagesRef,
  refreshLatest
);
```

**新代码：**
```tsx
const { send } = useMessageSender({
  type,
  pendingRequests,
  onSuccess: refreshLatest,
});
```

### 4. 替换文件处理

**旧代码：**
```tsx
const { addAttachmentsFromFiles, handleFileUpload } = useFileAttachments(
  images,
  setImages,
  setNotice,
  inputWrapRef
);
```

**新代码：**
```tsx
const { handleFileInput, handlePaste } = useFileHandler({
  inputWrapRef,
});
```

### 5. 替换草稿存储

**旧代码：**
```tsx
useDraftStorage(
  type,
  id,
  input,
  setInput,
  images,
  setImages,
  draftMentions,
  setDraftMentions,
  imagesRef
);
```

**新代码：**
```tsx
useDraftPersistence({ type, id });
```

### 6. 更新类型引用

**旧代码：**
```tsx
type MentionDraft = {
  userId: string;
  start: number;
  length: number;
  display: string;
};
```

**新代码：**
```tsx
import type { MentionDraft, ChatType, ImageAttachment } from "@/types/chat";
```

### 7. 使用纯函数处理业务逻辑

**旧代码：**
```tsx
const isPauseRequest = useCallback((req: CueRequest) => {
  if (!req.payload) return false;
  try {
    const obj = JSON.parse(req.payload) as Record<string, unknown>;
    return obj?.type === "confirm" && obj?.variant === "pause";
  } catch {
    return false;
  }
}, []);
```

**新代码：**
```tsx
import { isPauseRequest, filterPendingRequests } from "@/lib/chat-logic";

// 直接使用纯函数
const pending = filterPendingRequests(requests);
```

## 完整示例

参考 `src/components/chat-view-v2.tsx` 查看完整的迁移示例。

## 优势对比

### 旧架构
- ❌ 13 个参数的 Hook
- ❌ 类型定义重复
- ❌ 状态管理分散
- ❌ 业务逻辑与 React 耦合
- ❌ 错误处理不完善

### 新架构
- ✅ 对象参数，易于扩展
- ✅ 统一类型定义
- ✅ Context 集中管理状态
- ✅ 纯函数业务逻辑
- ✅ 完善的错误处理

## 注意事项

1. **渐进式迁移**：可以先迁移部分功能，逐步替换
2. **类型检查**：确保所有类型引用正确
3. **测试验证**：迁移后充分测试功能完整性
4. **性能监控**：观察是否有性能回归

## 废弃文件清理

迁移完成后可以删除以下文件：
- `hooks/use-message-actions.ts`
- `hooks/use-file-attachments.ts`
- `hooks/use-draft-storage.ts`
- `hooks/use-title-editing.ts`（未使用）

## 问题排查

### Context 未定义错误
确保组件被 `<ChatProvider>` 包裹。

### 类型错误
检查是否从 `@/types/chat` 导入了正确的类型。

### 状态不同步
确保使用 Context 中的状态，而不是本地 useState。

## 参考文档

- [架构设计文档](./ARCHITECTURE.md)
- [新架构示例](./src/components/chat-view-v2.tsx)
