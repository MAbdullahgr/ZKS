import type { Metadata, Viewport } from "next";
import "./globals.css";
import localFont from "next/font/local";
import { ThemeProvider } from "@/components/providers/ThemeProvider";

// Configure the local variable font
const inter = localFont({
  src: [
    {
      path: "../../public/fonts/Inter-VariableFont_opsz,wght.woff2",
      style: "normal",
    },
    {
      path: "../../public/fonts/Inter-Italic-VariableFont_opsz,wght.woff2",
      style: "italic",
    },
  ],
  // This loads all weights from 100 to 900 globally
  weight: "100 900",
  // This creates a CSS variable you can pass to Tailwind or standard CSS
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ZKS Store Management",
  description: "Store inventory and POS system",
};

// AUDIT-FIX R1: explicit viewport meta. Next.js 16 defaults to this, but
// being explicit guarantees correct mobile rendering across all platforms
// (older Android WebViews, embedded browsers) and enables the theme-color
// + safe-area insets used by the POS layout.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5, // allow zoom for accessibility (WCAG 1.4.4) but prevent layout breakage
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${inter.className} ${inter.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-background text-foreground antialiased">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[9999] focus:rounded-lg focus:bg-card focus:px-4 focus:py-2 focus:shadow-lg"
        >
          Skip to content
        </a>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
