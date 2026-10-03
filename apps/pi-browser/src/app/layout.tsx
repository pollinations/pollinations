import type { Metadata, Viewport } from "next";
import { Space_Grotesk, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const display = Space_Grotesk({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Pi in the Browser — powered by Pollinations",
  description:
    "The real Pi coding agent running fully in your browser via WebAssembly, spending your own Pollen on Pollinations models. Bring your account, pick a model, and let Pi build.",
  keywords: [
    "Pi coding agent",
    "Pollinations",
    "WASM",
    "Wasmer",
    "WASIX",
    "browser sandbox",
    "bring your own pollen",
    "AI coding agent",
  ],
  openGraph: {
    title: "Pi in the Browser — powered by Pollinations",
    description:
      "The real Pi coding agent in a browser-hosted WASM sandbox, spending your own Pollen.",
    siteName: "Pi in the Browser",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Pi in the Browser — powered by Pollinations",
    description:
      "The real Pi coding agent in a browser-hosted WASM sandbox, spending your own Pollen.",
  },
};

export const viewport: Viewport = {
  themeColor: "#17151f",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={`${display.variable} ${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground min-h-screen`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
