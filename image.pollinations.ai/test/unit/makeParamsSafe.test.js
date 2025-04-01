import { describe, it, expect } from 'vitest'
import { makeParamsSafe } from '../../src/makeParamsSafe.js'

describe('makeParamsSafe', () => {
  it('should sanitize input parameters', async () => {
    const input = {
      prompt: 'test prompt',
      width: 512,
      height: 512,
      seed: 123,
      model: 'flux',
      enhance: 'true',
      nologo: 'false',
      negative_prompt: 'worst quality',
      nofeed: false,
      safe: true
    }
    
    const result = makeParamsSafe(input)
    expect(result).toBeDefined()
    expect(result.width).toBe(512)
    expect(result.height).toBe(512)
    expect(result.seed).toBe(123)
    expect(result.model).toBe('flux')
    expect(result.enhance).toBe(true)
    expect(result.nologo).toBe(false)
    expect(result.negative_prompt).toBe('worst quality')
    expect(result.nofeed).toBe(false)
    expect(result.safe).toBe(true)
  })

  it('should handle invalid inputs with defaults', () => {
    const input = {
      width: 'invalid',
      height: 'invalid',
      seed: 'invalid',
      model: 'invalid_model'
    }

    const result = makeParamsSafe(input)
    expect(result.width).toBe(1024)
    expect(result.height).toBe(1024)
    expect(result.seed).toBe(42)
    expect(result.model).toBe('flux')
  })

  it('should properly sanitize malformed boolean string values', () => {
    const input = {
      enhance: 'falsee',  // Malformed string as reported in Issue #1418
      nologo: 'TRUE',     // Test case insensitivity
      nofeed: 'truee',    // Another malformed string
      safe: 'TrUe'        // Mixed case
    }

    const result = makeParamsSafe(input)
    expect(result.enhance).toBe(false)  // Should be false, not 'falsee'
    expect(result.nologo).toBe(true)    // Case-insensitive check
    expect(result.nofeed).toBe(false)   // Should be false, not 'truee'
    expect(result.safe).toBe(true)      // Mixed case should work
  })

  it('should handle null, undefined, and various types for boolean params', () => {
    const input = {
      enhance: null,
      nologo: undefined,
      nofeed: 0,
      safe: 1
    }

    const result = makeParamsSafe(input)
    expect(result.enhance).toBe(false)
    expect(result.nologo).toBe(false)
    expect(result.nofeed).toBe(false)
    expect(result.safe).toBe(false)
  })

  it('should preserve actual boolean values', () => {
    const input = {
      enhance: true,
      nologo: false
    }

    const result = makeParamsSafe(input)
    expect(result.enhance).toBe(true)
    expect(result.nologo).toBe(false)
  })
})
