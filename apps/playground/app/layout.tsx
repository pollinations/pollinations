import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Pollinations AI Playground',
  description: 'Generate text, images, and speech with Pollinations AI models',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-gray-950 text-gray-100 antialiased">{children}</body>
    </html>
  );
}
