import { useStore } from '@nanostores/react';
import { ClientOnly } from 'remix-utils/client-only';
import { chatStore } from '~/lib/stores/chat';
import { classNames } from '~/utils/classNames';
import { HeaderActionButtons } from './HeaderActionButtons.client';
import { ChatDescription } from '~/lib/persistence/ChatDescription.client';

export function Header() {
  const chat = useStore(chatStore);

  return (
    <header
      className={classNames('flex items-center p-5 border-b h-[var(--header-height)]', {
        'border-transparent': !chat.started,
        'border-pollinations-diy-elements-borderColor': chat.started,
      })}
    >
      <div className="flex items-center gap-2 z-logo text-pollinations-diy-elements-textPrimary cursor-pointer">
        <div className="i-ph:sidebar-simple-duotone text-xl" />
        <a href="/" className="text-2xl font-semibold text-[#ecf874] flex items-center font-title">
          Pollinations.DIY
        </a>
      </div>
      {chat.started ? ( // Display ChatDescription and HeaderActionButtons only when the chat has started.
        <>
          <span className="flex-1 px-4 truncate text-center text-pollinations-diy-elements-textPrimary">
            <ClientOnly>{() => <ChatDescription />}</ClientOnly>
          </span>
          <ClientOnly>
            {() => (
              <div className="mr-1">
                <HeaderActionButtons />
              </div>
            )}
          </ClientOnly>
        </>
      ) : (
        <div className="flex-1 flex justify-end">
          <a
            href="https://stackblitz-labs.github.io/bolt.diy/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-pollinations-diy-elements-textSecondary hover:text-pollinations-diy-elements-textPrimary transition-colors flex items-center gap-1"
          >
            🍴 Forked from bolt.diy <div className="i-ph:heart-duotone text-red-500" />
          </a>
        </div>
      )}
    </header>
  );
}
