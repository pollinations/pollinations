import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import App from './App'

// Mock the useModelMonitor hook
vi.mock('../hooks/useModelMonitor', () => ({
  useModelMonitor: () => ({
    models: [],
    gatewayStats: [],
    isPolling: false,
    togglePolling: vi.fn(),
    refresh: vi.fn(),
    pollInterval: 30000,
    lastUpdated: null,
    error: null,
    tinybirdConfigured: false,
    endpointStatus: { image: null, text: null }
  })
}))

describe('App', () => {
  it('renders the model monitor header', () => {
    render(<App />)
    
    expect(screen.getByText('Model Monitor')).toBeInTheDocument()
    expect(screen.getByText('5-minute window')).toBeInTheDocument()
  })

  it('shows the polling toggle button', () => {
    render(<App />)
    
    const toggleButton = screen.getByRole('button', { name: /auto 15s/i })
    expect(toggleButton).toBeInTheDocument()
  })

  it('displays model counts for image and text', () => {
    render(<App />)
    
    expect(screen.getByText('image: 0')).toBeInTheDocument()
    expect(screen.getByText('text: 0')).toBeInTheDocument()
  })
})