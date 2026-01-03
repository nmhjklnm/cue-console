"use client";

import { type ReactNode, useMemo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";

export function MarkdownRenderer({ children }: { children: string }) {
  const components = useMemo<Partial<Components>>(
    () => ({
      p: ({ children }: { children?: ReactNode }) => <p>{children}</p>,
      a: ({ children, href }: { children?: ReactNode; href?: string }) => (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2 break-all"
        >
          {children}
        </a>
      ),
      code: ({ children }: { children?: ReactNode }) => (
        <code className="rounded bg-muted/40 px-1 py-0.5 text-[0.9em] wrap-anywhere">
          {children}
        </code>
      ),
      pre: ({ children }: { children?: ReactNode }) => (
        <pre className="mt-2 max-w-full overflow-auto rounded-lg border bg-muted/30 p-2 text-xs text-muted-foreground">
          {children}
        </pre>
      ),
      img: (props) => {
        const safeSrc = typeof props.src === "string" ? props.src : undefined;
        const safeAlt = typeof props.alt === "string" ? props.alt : "";
        return <img {...props} src={safeSrc} alt={safeAlt} className="max-w-full h-auto" />;
      },
      table: ({ children }: { children?: ReactNode }) => (
        <div className="mt-2 max-w-full overflow-auto">
          <table className="w-full text-left text-sm">{children}</table>
        </div>
      ),
    }),
    []
  );

  return (
    <div className="md-flow">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]} components={components}>
        {children || ""}
      </ReactMarkdown>
    </div>
  );
}
