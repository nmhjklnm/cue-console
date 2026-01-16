export class ChatError extends Error {
  constructor(
    message: string,
    public code?: string,
    public details?: unknown
  ) {
    super(message);
    this.name = "ChatError";
  }
}

export function handleError(error: unknown): string {
  if (error instanceof ChatError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "An unexpected error occurred";
}

export function logError(error: unknown, context?: string): void {
  const message = handleError(error);
  const prefix = context ? `[${context}]` : "";
  
  // In production, this would send to error tracking service
  console.error(`${prefix} ${message}`, error);
}

export function withErrorHandling<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  context: string
): T {
  return (async (...args: Parameters<T>) => {
    try {
      return await fn(...args);
    } catch (error) {
      logError(error, context);
      throw error;
    }
  }) as T;
}
