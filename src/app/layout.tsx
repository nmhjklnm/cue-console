import type { Metadata } from "next";
import "@fontsource-variable/source-sans-3";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Cue",
  description: "AI agent collaboration console",
  icons: {
    icon: "/cue-icon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className="antialiased"
        suppressHydrationWarning
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
