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
})
