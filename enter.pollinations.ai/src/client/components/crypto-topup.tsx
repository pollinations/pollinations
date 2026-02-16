import { useWeb3Modal } from '@web3modal/wagmi/react'
import { useAccount, useWalletClient } from 'wagmi'
import { useState, useEffect } from 'react'
import { wrapFetchWithPayment } from "@x402/fetch"
import { x402Client } from "@x402/core/client"
import { registerExactEvmScheme as registerClientEvmScheme } from "@x402/evm/exact/client"
import { Button } from './button'

export function CryptoTopup() {
  const { open } = useWeb3Modal()
  const { isConnected, address } = useAccount()
  const { data: walletClient } = useWalletClient()
  const [loading, setLoading] = useState<number | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const handlePay = async (amount: number) => {
    if (!walletClient) return
    setLoading(amount)
    setMessage("Processing payment... Please confirm in your wallet.")

    try {
      // Initialize x402 client with the connected wallet
      const client = new x402Client()
      registerClientEvmScheme(client, { signer: walletClient })
      
      const fetchWithPay = wrapFetchWithPayment(fetch, client)
      
      // Request the protected resource
      const res = await fetchWithPay(`/api/crypto/topup/${amount}`, {
        method: "POST",
        credentials: "include",
        headers: {
        },
      })
      
      if (res.ok) {
        const data = await res.json()
        setMessage(`Success! ${data.message}`)
        // Refresh page or balance?
        setTimeout(() => window.location.reload(), 2000)
      } else {
        const err = await res.text()
        setMessage(`Error: ${err}`)
      }
    } catch (e: any) {
      console.error(e)
      setMessage(`Payment failed: ${e.message}`)
    } finally {
      setLoading(null)
    }
  }

  if (!isConnected) {
    return (
      <div className="flex flex-col gap-4 p-4 border rounded-lg bg-gray-50">
        <h3 className="text-lg font-bold">Pay with Crypto (USDC)</h3>
        <p className="text-sm text-gray-600">Connect your wallet to top up with USDC on Base.</p>
        <Button onClick={() => open()} color="violet">Connect Wallet</Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 p-4 border rounded-lg bg-gray-50">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-bold">Pay with Crypto (USDC)</h3>
        <Button onClick={() => open()} weight="light" size="small">
          {address?.slice(0, 6)}...{address?.slice(-4)}
        </Button>
      </div>
      
      <div className="flex flex-wrap gap-2">
        {[5, 10, 20, 50].map((amount) => (
          <Button
            key={amount}
            onClick={() => handlePay(amount)}
            disabled={loading !== null}
            color="violet"
            className={loading === amount ? "opacity-50" : ""}
          >
            {loading === amount ? "Processing..." : `$${amount} USDC`}
          </Button>
        ))}
      </div>
      
      {message && (
        <p className={`text-sm ${message.includes("Success") ? "text-green-600" : "text-red-600"}`}>
          {message}
        </p>
      )}
    </div>
  )
}
