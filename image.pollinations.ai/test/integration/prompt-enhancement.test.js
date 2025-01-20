import { describe, it, expect, beforeAll } from 'vitest'
import { normalizeAndTranslatePrompt } from '../../src/normalizeAndTranslatePrompt.js'

describe('Prompt Enhancement Integration Tests', () => {
  it('should enhance a simple English prompt', async () => {
    const originalPrompt = "a red bird"
    const mockReq = {
      headers: { "accept-language": "en-US" }
    }
    const timingInfo = []
    
    const result = await normalizeAndTranslatePrompt(originalPrompt, mockReq, timingInfo, { enhance: true })
    
    expect(result).to.be.an('object')
    expect(result.prompt).to.be.a('string')
    expect(result.wasPimped).toBe(true)
    expect(result.prompt).to.include(originalPrompt) // Original text is preserved
    // Enhanced prompt should have more details
    expect(result.prompt.length).to.be.greaterThan(originalPrompt.length)
  })

  it('should enhance a non-English prompt', async () => {
    const originalPrompt = "美しい赤い鳥" // Beautiful red bird in Japanese
    const mockReq = {
      headers: { "accept-language": "ja-JP" }
    }
    const timingInfo = []
    
    const result = await normalizeAndTranslatePrompt(originalPrompt, mockReq, timingInfo)
    
    expect(result).to.be.an('object')
    expect(result.prompt).to.be.a('string')
    expect(result.wasPimped).toBe(true)
    expect(result.prompt).to.include(originalPrompt) // Original text is preserved
    // Enhanced prompt should contain English words
    expect(result.prompt).to.match(/beautiful|red|bird/i)
  })

  it('should respect enhance=false parameter', async () => {
    const originalPrompt = "a simple test prompt"
    const mockReq = {
      headers: { "accept-language": "en-US" }
    }
    const timingInfo = []
    
    const result = await normalizeAndTranslatePrompt(originalPrompt, mockReq, timingInfo, { enhance: false })
    
    expect(result).to.be.an('object')
    expect(result.prompt).toBe(originalPrompt)
    expect(result.wasPimped).toBe(false)
  })

  it('should handle prompts with style references', async () => {
    const originalPrompt = "a landscape by Van Gogh"
    const mockReq = {
      headers: { "accept-language": "en-US" }
    }
    const timingInfo = []
    
    const result = await normalizeAndTranslatePrompt(originalPrompt, mockReq, timingInfo, { enhance: true })
    
    expect(result).to.be.an('object')
    expect(result.prompt).to.be.a('string')
    expect(result.wasPimped).toBe(true)
    expect(result.prompt).to.include(originalPrompt) // Original text is preserved
    // Should expand on Van Gogh's style
    expect(result.prompt.toLowerCase()).to.match(/impressionist|post-impressionist|vibrant|swirling|bold/)
  })

  it('should handle long prompts without enhancement', async () => {
    const originalPrompt = "A detailed scene depicting a serene mountain landscape at sunset, with snow-capped peaks reflecting the golden light, while a group of hikers make their way along a winding trail through a meadow filled with wildflowers, as eagles soar overhead in the crisp mountain air"
    const mockReq = {
      headers: { "accept-language": "en-US" }
    }
    const timingInfo = []
    
    const result = await normalizeAndTranslatePrompt(originalPrompt, mockReq, timingInfo)
    
    expect(result).to.be.an('object')
    expect(result.prompt).toBe(originalPrompt)
    // For prompts longer than 100 characters, enhance is not explicitly set to true
    expect(result.wasPimped).toBe(undefined)
  })

  it('should memoize results for same prompt and seed', async () => {
    const originalPrompt = "test memoization"
    const mockReq = {
      headers: { "accept-language": "en-US" }
    }
    const timingInfo = []
    const params = { enhance: true, seed: 42 }
    
    // First call
    const result1 = await normalizeAndTranslatePrompt(originalPrompt, mockReq, timingInfo, params)
    // Second call with same prompt and seed
    const result2 = await normalizeAndTranslatePrompt(originalPrompt, mockReq, timingInfo, params)
    
    expect(result1).to.deep.equal(result2)
  })

  it('should handle errors gracefully', async () => {
    const originalPrompt = "test error handling"
    const mockReq = {
      headers: { "accept-language": "en-US" }
    }
    const timingInfo = []
    
    // Force a timeout by using a very long prompt
    const result = await normalizeAndTranslatePrompt("x".repeat(10000), mockReq, timingInfo, { enhance: true })
    
    expect(result).to.be.an('object')
    expect(result.prompt).to.be.a('string')
    // On error, should return original prompt
    expect(result.prompt).to.include("x".repeat(10000))
  })
}, 30000) // Increase timeout since we're making real API calls
