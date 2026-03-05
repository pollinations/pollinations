import { AppSidebar } from '@/components/AppSidebar';
import { AuthStatus } from '@/components/AuthStatus';
import { ModelsProvider } from '@/components/ModelsProvider';
import { PollinationsApiKeyProvider } from '@/components/PollinationsApiKeyProvider';
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import type { Metadata, Viewport } from 'next';
import { Toaster } from 'sonner';
import './globals.css';

export const viewport: Viewport = {
  themeColor: '#a3e635',
  width: 'device-width',
  initialScale: 1,
};

export const metadata: Metadata = {
  title: 'Pollinations Playground',
  description:
    'Interactive playground for Pollinations AI models. Generate text, images, video, audio, and more with cutting-edge open-source AI.',
  keywords: [
    'Pollinations',
    'AI Playground',
    'text generation',
    'image generation',
    'video generation',
    'speech synthesis',
    'audio transcription',
    'open source AI',
    'generative AI',
    'AI API',
  ],
  authors: [{ name: 'pollinations.ai', url: 'https://pollinations.ai' }],
  creator: 'pollinations.ai',
  robots: 'index, follow',
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
    ],
    shortcut: '/favicon.ico',
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180' },
      { url: '/apple-touch-icon-152x152.png', sizes: '152x152' },
      { url: '/apple-touch-icon-167x167.png', sizes: '167x167' },
    ],
  },
  openGraph: {
    type: 'website',
    url: 'https://playground.pollinations.ai/',
    title: 'Pollinations Playground',
    description:
      'Interactive playground for Pollinations AI models. Generate text, images, video, audio, and more with cutting-edge open-source AI.',
    siteName: 'Pollinations Playground',
    locale: 'en_US',
    images: [
      {
        url: 'https://playground.pollinations.ai/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Pollinations Playground',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Pollinations Playground',
    description:
      'Interactive playground for Pollinations AI models. Generate text, images, video, audio, and more with cutting-edge open-source AI.',
    images: ['https://playground.pollinations.ai/og-image.png'],
    creator: '@pollinations_ai',
    site: '@pollinations_ai',
  },
  applicationName: 'Pollinations Playground',
  category: 'Technology',
  other: {
    'msapplication-TileColor': '#a3e635',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <PollinationsApiKeyProvider>
          <ModelsProvider>
            <SidebarProvider>
              <AppSidebar />
              <SidebarInset className="flex flex-col h-screen overflow-hidden">
                <header className="flex h-16 shrink-0 items-center justify-between gap-2 border-b px-4">
                  <SidebarTrigger className="-ml-1" />
                  <AuthStatus />
                </header>
                <div className="flex-1 overflow-hidden p-4">
                  <div className="h-full rounded-xl bg-muted/50 px-6 overflow-hidden">
                    <div className="container mx-auto h-full">
                      {children}
                    </div>
                  </div>
                </div>
              </SidebarInset>
            </SidebarProvider>
          </ModelsProvider>
        </PollinationsApiKeyProvider>
        <Toaster />
      </body>
    </html>
  );
}
