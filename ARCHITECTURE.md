# Chat Architecture

## 设计原则

遵循 Linus Torvalds 的工程化理念：
1. **简单优于复杂**：避免过度抽象
2. **明确的职责边界**：状态管理、业务逻辑、副作用分离
3. **类型安全**：统一的类型定义
4. **错误处理**：要么正确处理，要么让它崩溃
5. **性能优先**：避免不必要的重渲染

## 架构层次

```
┌─────────────────────────────────────┐
│         Components (UI)             │
│  - ChatView, ChatHeader, etc.       │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│      Context (State Management)     │
│  - ChatContext (shared state)       │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│      Hooks (React Integration)      │
│  - useMessageSender                 │
│  - useFileHandler                   │
│  - useDraftPersistence              │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│    Pure Functions (Business Logic)  │
│  - chat-logic.ts                    │
│  - file-utils.ts                    │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│      API Layer (Data Access)        │
│  - actions.ts                       │
└─────────────────────────────────────┘
```

## 核心模块

### 1. 类型定义 (`types/chat.ts`)
统一的类型定义，避免重复：
- `ChatType`, `MentionDraft`, `ImageAttachment`
- `ChatState`, `ChatMetadata`
- `MessageActionParams`, `MessageActionResult`

### 2. 业务逻辑 (`lib/chat-logic.ts`)
纯函数，易于测试：
- `isPauseRequest()` - 判断是否为暂停请求
- `filterPendingRequests()` - 过滤待处理请求
- `calculateMessageTargets()` - 计算消息目标

### 3. 状态管理 (`contexts/chat-context.tsx`)
使用 Context 避免 prop drilling：
- 集中管理 input, images, draftMentions
- 提供 clearInput, clearAll 等便捷方法

### 4. 改进的 Hooks

#### `useMessageSender`
```typescript
const { send } = useMessageSender({
  type: "agent",
  pendingRequests,
  onSuccess: refreshLatest,
});
```
- 使用对象参数，易于扩展
- 从 Context 获取状态，减少参数传递
- 依赖数组优化，避免不必要的重新创建

#### `useFileHandler`
```typescript
const { handleFileInput, handlePaste } = useFileHandler({
  inputWrapRef,
});
```
- 统一的文件处理逻辑
- 使用 Promise.allSettled 处理批量上传
- 完善的错误处理和日志记录

#### `useDraftPersistence`
```typescript
useDraftPersistence({ type, id });
```
- 自动加载和保存草稿
- 防抖优化，减少 localStorage 写入
- 错误处理不影响主流程

### 5. 错误处理 (`lib/error-handler.ts`)
统一的错误处理机制：
- `ChatError` - 自定义错误类型
- `handleError()` - 统一错误消息格式化
- `logError()` - 错误日志记录
- `withErrorHandling()` - 高阶函数包装

## 使用示例

```tsx
function ChatView({ type, id, name }: ChatViewProps) {
  return (
    <ChatProvider>
      <ChatViewContent type={type} id={id} name={name} />
    </ChatProvider>
  );
}

function ChatViewContent({ type, id }: Props) {
  const { input, busy } = useChatContext();
  
  useDraftPersistence({ type, id });
  
  const { send } = useMessageSender({
    type,
    pendingRequests,
    onSuccess: refreshLatest,
  });
  
  const { handleFileInput, handlePaste } = useFileHandler({
    inputWrapRef,
  });
  
  return (
    <div>
      <textarea
        value={input}
        onPaste={handlePaste}
      />
      <button onClick={send} disabled={busy}>
        Send
      </button>
    </div>
  );
}
```

## 性能优化

1. **减少依赖数组**：使用 Context 减少 hook 参数
2. **防抖保存**：草稿保存延迟 300ms
3. **useRef 缓存**：避免闭包陷阱
4. **Promise.allSettled**：并行处理文件上传
5. **明确的 memo 边界**：只在必要时使用 useMemo

## 测试策略

1. **纯函数测试**：`chat-logic.ts` 中的函数易于单元测试
2. **Hook 测试**：使用 `@testing-library/react-hooks`
3. **集成测试**：测试 Context + Hooks 的组合
4. **错误场景**：测试错误处理和边界情况

## 迁移指南

从旧架构迁移到新架构：

1. 用 `ChatProvider` 包裹组件
2. 替换 `useState` 为 `useChatContext()`
3. 使用新的 hooks 替代旧的实现
4. 移除重复的类型定义
5. 更新错误处理逻辑
