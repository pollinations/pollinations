import { describe, it, expect, beforeAll } from 'vitest'
import { translateIfNecessary, sanitizeString } from '../../src/translateIfNecessary.js'
import { registerServer } from '../../src/availableServers.js'
import fetch from 'node-fetch'

describe('Translation Service Integration Tests', () => {
  // Register translation servers from the main pollinations endpoint
  beforeAll(async () => {
    try {
      const response = await fetch('https://image.pollinations.ai/register')
      const servers = await response.json()
      
      // Register all available translation servers
      servers
        .filter(server => server.type === 'translate')
        .forEach(server => {
          registerServer(server.url, 'translate')
        })
    } catch (error) {
      console.error('Failed to fetch translation servers:', error)
      throw error // Fail the test setup if we can't get servers
    }
  })

  it('should translate non-English text through the actual translation service', async () => {
    const germanText = "Ein schöner Sonnenuntergang am Strand"
    const result = await translateIfNecessary(germanText)
    expect(result).to.be.a('string')
    
    // The result contains both translation and original text
    const [translation, original] = result.split('\n\n')
    expect(original).toBe(germanText) // Original text is preserved
    expect(translation).toMatch(/^[A-Za-z\s.,]+$/) // Translation should be English
    expect(translation.toLowerCase()).to.include('beautiful') // Common translation for "schöner"
  })

  it('should preserve English text without translation', async () => {
    const englishText = "A beautiful sunset at the beach"
    const result = await translateIfNecessary(englishText)
    expect(result).toBe(englishText) // Should remain unchanged
  })

  it('should handle network errors gracefully', async () => {
    // Register an invalid server to test error handling
    registerServer('http://invalid-server:5000', 'translate')
    
    const germanText = "Ein schöner Tag"
    const result = await translateIfNecessary(germanText)
    // On network error, should return original text
    expect(result).toBe(germanText)
  })

  it('should handle special characters and UTF-8 encoding', async () => {
    const japaneseText = "美しい夕日"
    const result = await translateIfNecessary(japaneseText)
    expect(result).to.be.a('string')
    
    // The result contains both translation and original text
    const [translation, original] = result.split('\n\n')
    expect(original).toBe(japaneseText) // Original text is preserved
    expect(translation).toMatch(/^[A-Za-z\s.,]+$/) // Translation should be English
    expect(translation.toLowerCase()).to.include('beautiful') // Common translation for "美しい"
  })
}, 10000) // Increase timeout to 10s since translation can be slow
