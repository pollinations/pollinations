


import type { Metadata } from "next";
import localFont from "next/font/local";
import './globals.css'
import { ThemeProvider } from "@/components/theme-provider"
import Script from "next/script";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
  display: "swap",
});

const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL('https://reac-docs.pollinations.ai'),
  title: {
    default: "Pollinations Generative AI Playground: Interactive React Hooks Documentation",
    template: "%s | Pollinations React Hooks"
  },
  description: "Comprehensive documentation for Pollinations React Hooks. Learn how to integrate AI-generated images and text into your React applications with ease.",
  keywords: ["Karma", "Components", "React Hooks", "PollinationsText", "PollinationsMarkdown", "PollinationsImage", "usePollinationsImage", "OpenAI", "GPT", "Mistral", "Karma.yt", "Pollinations.ai", "React", "Next.js", "AI-generated images", "documentation", "AI", "image generation"],
  authors: [{ name: "Pollinations.ai" }, { name: "Karma.yt" }],
  creator: "Karma.yt",
  publisher: "Karma.yt",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://reac-docs.pollinations.ai",
    title: "Pollinations React Hooks Documentation",
    description: "Pollinations Generative AI Playground: Interactive React Hooks Documentation",
    siteName: "Pollinations React Hooks Documentation",
    images: [
      {
        url: "/opengraph-image.png",
        width: 1200,
        height: 630,
        alt: "Pollinations React Hooks Documentation",
      },
    ],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  alternates: {
    canonical: "https://reac-docs.pollinations.ai",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Script
          strategy="afterInteractive"
          src={`https://www.googletagmanager.com/gtag/js?id=G-4QJ7GS0M0S`}
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-4QJ7GS0M0S', {
              page_path: window.location.pathname,
            });
          `}
        </Script>
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}