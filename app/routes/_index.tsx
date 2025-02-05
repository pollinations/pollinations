import { json, type MetaFunction } from '@remix-run/cloudflare';
import { ClientOnly } from 'remix-utils/client-only';
import { BaseChat } from '~/components/chat/BaseChat';
import { Chat } from '~/components/chat/Chat.client';
import { Header } from '~/components/header/Header';

export const meta: MetaFunction = () => {
  return [{ title: 'Pollinations.DIY' }, { name: 'description', content: 'Create with Pollinations.DIY, your AI coding assistant' }];
};

export const loader = () => json({});

export default function Index() {
  return (
    <div className="flex flex-col h-full w-full bg-[#110518]">
      <Header />
      <ClientOnly fallback={<BaseChat />}>{() => <Chat />}</ClientOnly>
      <a
        href="https://stackblitz-labs.github.io/bolt.diy/"
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-4 right-4 text-sm text-pollinations-diy-elements-textSecondary hover:text-pollinations-diy-elements-textPrimary transition-colors flex items-center gap-1"
      >
        <span className="text-xl">🍴</span> bolt.diy
      </a>
    </div>
  );
}
