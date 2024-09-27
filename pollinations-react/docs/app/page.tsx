'use client'
import React, { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import TextTab from './components/TextTab';
import ImageTab from './components/ImageTab';
import ChatTab from './components/ChatTab';

const tabs = [
  { value: 'text', label: 'usePollinationsText', shortLabel: 'Text', component: <TextTab /> },
  { value: 'image', label: 'usePollinationsImage', shortLabel: 'Image', component: <ImageTab /> },
  { value: 'chat', label: 'usePollinationsChat', shortLabel: 'Chat', component: <ChatTab /> }
];

export default function PollinationsDemo() {
  const [activeTab, setActiveTab] = useState<'text' | 'image' | 'chat'>('text');

  return (
    <div className="container mx-auto p-4 bg-slate-900 text-slate-100 max-w-4xl">
      <h1 className="text-4xl font-bold mb-2 text-center">
        <a href="https://github.com/pollinations/pollinations" target="_blank" rel="noopener noreferrer" className="hover:text-blue-400 transition-colors">
          🌸 Pollinations Generative React Hooks 2.0.1 🌸
        </a>
      </h1>
      <h2 className="text-xl mb-8 text-center text-slate-300">This playground is designed to showcase the versatility and hackability of the Pollinations API</h2>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'text' | 'image' | 'chat')} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          {tabs.map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              className={`${activeTab === tab.value ? 'bg-slate-300 text-white underline' : 'bg-slate-800 text-slate-500'} transition-colors duration-200 hover:bg-slate-600`}
            >
              <span className="hidden sm:inline">{tab.label}</span>
              <span className="sm:hidden">{tab.shortLabel}</span>
            </TabsTrigger>
          ))}
        </TabsList>
        {tabs.map((tab) => (
          <TabsContent key={tab.value} value={tab.value}>
            {tab.component}
          </TabsContent>
        ))} 
      </Tabs>

      <footer className="mt-8 text-center text-slate-300">
        <p>Made with ❤️ by <a className='hover:underline' href="https://pollinations.ai">Pollinations.ai</a>
         &nbsp;and&nbsp;
          <a className='hover:underline' href="https://karma.yt" title='Karma.yt'>Karma.yt</a></p>
        <div className="mt-2 flex justify-center space-x-4">
          <a href="https://github.com/pollinations/pollinations/pollinations-react" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">
            View on GitHub
          </a>
          <a href="https://www.npmjs.com/package/@pollinations/react" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">
            @pollinations/react on NPM
          </a>
          <a href="https://discord.com/invite/kuPRYEJS" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">
            <svg className="w-6 h-6 inline-block mr-1" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418z" />
            </svg>
            Discord
          </a>
          <a href="https://chat.whatsapp.com/JxQEn2FKDny0DdwkDuzoQR" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">
            <svg className="w-6 h-6 inline-block mr-1" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967c-.273-.099-.471-.148-.67.15c-.197.297-.767.966-.94 1.164c-.173.199-.347.223-.644.075c-.297-.15-1.255-.463-2.39-1.475c-.883-.788-1.48-1.761-1.653-2.059c-.173-.297-.018-.458.13-.606c.134-.133.298-.347.446-.52c.149-.174.198-.298.298-.497c.099-.198.05-.371-.025-.52c-.075-.149-.669-1.612-.916-2.207c-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372c-.272.297-1.04 1.016-1.04 2.479c0 1.462 1.065 2.875 1.213 3.074c.149.198 2.096 3.2 5.077 4.487c.709.306 1.262.489 1.694.625c.712.227 1.36.195 1.871.118c.571-.085 1.758-.719 2.006-1.413c.248-.694.248-1.289.173-1.413c-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214l-3.741.982l.998-3.648l-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884c2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
            </svg>
            WhatsApp
          </a>
        </div>
      </footer>
    </div>
  )
}