import type { Metadata } from "next";
import localFont from "next/font/local";
import './globals.css'
import { ThemeProvider } from "@/components/theme-provider"
import Script from "next/script";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "Pollinations React Components Documentation",
  description: "Dynamic Pollinations React Components Documentation. by Karma.yt",
  keywords: ["Karma", "Componnents", "React Hooks", "PollinationsText", "PollinationsMarkdown", "PollinationsImage", "usePollinationsImage", "OpenAI", "GPT", "Mistral", "Karma.yt", "Pollinations.ai", "React", "Next.js", "AI-generated images", "documentation", "react", "AI", "image generation"].join(', '), openGraph: {
    images: '/opengraph-image.png'
  }
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
        <Script
          async
          src="https://www.googletagmanager.com/gtag/js?id=G-4QJ7GS0M0S"
        />
        <Script id="google-analytics">
          {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', 'G-4QJ7GS0M0S');
          `}
        </Script>
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
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