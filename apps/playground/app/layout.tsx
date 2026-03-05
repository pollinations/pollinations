import { AppSidebar } from '@/components/AppSidebar';
import { AuthStatus } from '@/components/AuthStatus';
import { ModelsProvider } from '@/components/ModelsProvider';
import { PollinationsApiKeyProvider } from '@/components/PollinationsApiKeyProvider';
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import type { Metadata } from 'next';
import { Toaster } from 'sonner';
import './globals.css';

export const metadata: Metadata = {
  title: 'Pollinations AI-SDK Examples',
  description: 'Examples for Pollinations AI SDK provider',
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
