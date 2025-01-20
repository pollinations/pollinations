import { describe, it, expect, vi, beforeEach } from 'vitest'
import { sanitizeString } from '../../src/translateIfNecessary.js'
import debug from 'debug'

// Mock debug
vi.mock('debug', () => {
  return {
    default: vi.fn(() => vi.fn())
  }
})

describe('sanitizeString', () => {
  it('should preserve Persian characters', () => {
    const persianText = 'یک پرنده قرمز زیبا'
    expect(sanitizeString(persianText)).toBe(persianText)
  })

  it('should preserve mixed Persian and English text', () => {
    const mixedText = 'Hello یک پرنده قرمز زیبا World'
    expect(sanitizeString(mixedText)).toBe(mixedText)
  })

  it('should remove control characters while preserving valid text', () => {
    const textWithControl = 'Hello\u0000World\u0007یک'
    expect(sanitizeString(textWithControl)).toBe('HelloWorldیک')
  })

  it('should handle empty string', () => {
    expect(sanitizeString('')).toBe('')
  })

  it('should handle null or undefined', () => {
    expect(sanitizeString(null)).toBe(null)
    expect(sanitizeString(undefined)).toBe(undefined)
  })

  it('should preserve other non-Latin scripts', () => {
    const multiScript = '你好 שָׁלוֹם مرحبا γεια σας'
    expect(sanitizeString(multiScript)).toBe(multiScript)
  })
})