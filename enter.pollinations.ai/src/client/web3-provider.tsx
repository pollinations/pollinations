import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { createWeb3Modal } from '@web3modal/wagmi/react'
import { defaultWagmiConfig } from '@web3modal/wagmi/react/config'
import { WagmiProvider } from 'wagmi'
import { base, baseSepolia } from 'wagmi/chains'

// 1. Get projectId at https://cloud.walletconnect.com
const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || 'c07d3056158752c0032f654df2335133' // Public demo ID or replace

// 2. Create wagmiConfig
const metadata = {
  name: 'Pollinations',
  description: 'Pollinations AI Crypto Topup',
  url: 'https://pollinations.ai',
  icons: ['https://pollinations.ai/favicon.ico']
}

const chains = [base, baseSepolia] as const
const config = defaultWagmiConfig({
  chains,
  projectId,
  metadata,
})

// 3. Create modal
createWeb3Modal({
  wagmiConfig: config,
  projectId,
  enableAnalytics: true
})

const queryClient = new QueryClient()

export function Web3Provider({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  )
}
