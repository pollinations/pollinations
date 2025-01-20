import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setupTranslationMock } from '../mocks/translationService.js'

describe('Translation Integration Tests', () => {
  beforeEach(async () => {
    vi.resetModules()
    setupTranslationMock()
  })

  it('should handle non-English prompts correctly', async () => {
    const { translateIfNecessary } = await import('../../src/translateIfNecessary.js')
    const germanPrompt = "Ein schöner Sonnenuntergang am Strand"
    const result = await translateIfNecessary(germanPrompt)
    expect(result).toBe("A beautiful sunset at the beach")
  })

  it('should preserve special tokens during translation', async () => {
    const { translateIfNecessary } = await import('../../src/translateIfNecessary.js')
    const promptWithTokens = "--ar 16:9 --q 2 Ein fantastisches Schloss --seed 123"
    const result = await translateIfNecessary(promptWithTokens)
    expect(result).toBe(promptWithTokens) // Special tokens should prevent translation
  })

  // TODO: Fix test after implementing proper language detection
  // it('should handle multiple languages in image generation pipeline', async () => {
  //   const { translateIfNecessary } = await import('../../src/translateIfNecessary.js')
  //   const multiLangPrompts = [
  //     "Une belle fleur rouge", // French
  //     "Ein blauer Schmetterling", // German
  //     "Una montaña nevada" // Spanish
  //   ]

  //   const expectedTranslations = [
  //     "A beautiful red flower",
  //     "A blue butterfly",
  //     "A snowy mountain"
  //   ]

  //   for (let i = 0; i < multiLangPrompts.length; i++) {
  //     const translatedPrompt = await translateIfNecessary(multiLangPrompts[i])
  //     expect(translatedPrompt).toBe(expectedTranslations[i])
  //   }
  // })

  it('should not translate English prompts', async () => {
    const { translateIfNecessary } = await import('../../src/translateIfNecessary.js')
    const englishPrompt = "A beautiful sunset over mountains"
    const result = await translateIfNecessary(englishPrompt)
    expect(result).toBe(englishPrompt)
  })

  it('should handle empty or invalid inputs', async () => {
    const { translateIfNecessary } = await import('../../src/translateIfNecessary.js')
    const emptyPrompt = ""
    const result = await translateIfNecessary(emptyPrompt)
    expect(result).toBe(emptyPrompt)

    const invalidPrompt = "   "
    const invalidResult = await translateIfNecessary(invalidPrompt)
    expect(invalidResult).toBe(invalidPrompt)
  })

  it('should preserve Persian text through the entire pipeline', async () => {
    const { translateIfNecessary, sanitizeString } = await import('../../src/translateIfNecessary.js')
    const persianPrompt = "یک پرنده قرمز زیبا در پنجره کلیسا"
    
    // Test sanitization
    const sanitized = sanitizeString(persianPrompt)
    expect(sanitized).toBe(persianPrompt)
    
    // Test full translation pipeline
    const result = await translateIfNecessary(persianPrompt)
    // Since it's Persian, it should be translated to English
    expect(result).not.toBe(persianPrompt)
    expect(result).toMatch(/^[A-Za-z\s.,]+$/) // Should be English text
  })

  it('should handle Persian text with image generation parameters', async () => {
    const { translateIfNecessary, sanitizeString } = await import('../../src/translateIfNecessary.js')
    const persianWithParams = "یک پرنده قرمز زیبا --ar 16:9 --seed 123"
    
    // Test sanitization
    const sanitized = sanitizeString(persianWithParams)
    expect(sanitized).toBe(persianWithParams)
    
    // With parameters, it should not be translated
    const result = await translateIfNecessary(persianWithParams)
    expect(result).toBe(persianWithParams)
  })

  it('should integrate translation with image generation params', async () => {
    const { translateIfNecessary } = await import('../../src/translateIfNecessary.js')
    const prompt = "Ein großer blauer Wal --ar 16:9"
    const translatedPrompt = await translateIfNecessary(prompt)
    expect(translatedPrompt).toBe(prompt) // Should not translate due to special tokens
  })
})
