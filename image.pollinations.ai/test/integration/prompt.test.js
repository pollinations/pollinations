import { describe, it, expect } from 'vitest'
import { normalizeAndTranslatePrompt } from '../../src/normalizeAndTranslatePrompt.js'
import { pimpPrompt } from '../../src/groqPimp.js'
import { detectLanguage, translateIfNecessary } from '../../src/translateIfNecessary.js'

describe('Prompt Integration Tests', () => {
  it('should enhance prompts by default', async () => {
    const req = {
      headers: { 'accept-language': 'en-US' }
    }
    const timingInfo = []
    const originalPrompt = 'a cute cat'
    
    const result = await normalizeAndTranslatePrompt(
      originalPrompt,
      req,
      timingInfo,
      { seed: 123 }
    )

    expect(result).to.be.a('string')
    expect(result.length).to.be.greaterThan(originalPrompt.length)
    expect(result).to.include(originalPrompt)
  })

  it('should handle non-English prompts', async () => {
    const req = {
      headers: { 'accept-language': 'fr-FR' }
    }
    const timingInfo = []
    const originalPrompt = 'un chat mignon'  // French for "a cute cat"
    
    const result = await normalizeAndTranslatePrompt(
      originalPrompt,
      req,
      timingInfo,
      { seed: 123 }
    )

    expect(result).to.be.a('string')
    expect(result.length).to.be.greaterThan(originalPrompt.length)
  })

  it('should respect enhance=false', async () => {
    const req = {
      headers: { 'accept-language': 'en-US' }
    }
    const timingInfo = []
    const originalPrompt = 'a simple prompt'
    
    const result = await normalizeAndTranslatePrompt(
      originalPrompt,
      req,
      timingInfo,
      { seed: 123, enhance: false }
    )

    expect(result).to.equal(originalPrompt)
  })

  it('should handle special characters and sanitization', async () => {
    const req = {
      headers: { 'accept-language': 'en-US' }
    }
    const timingInfo = []
    const originalPrompt = '  a  messy    prompt   with   spaces  !@#$%  '
    
    const result = await normalizeAndTranslatePrompt(
      originalPrompt,
      req,
      timingInfo,
      { seed: 123 }
    )

    expect(result).to.be.a('string')
    expect(result).not.to.include('  ')  // Should not have double spaces
    expect(result.length).to.be.greaterThan(originalPrompt.trim().length)
  })

  // TODO: Fix test after implementing proper language detection
  // it('should detect language correctly', async () => {
  //   const frenchText = "Une belle fleur rouge"
  //   const englishText = "A beautiful red flower"
  //   const germanText = "Ein schöner blauer Himmel"

  //   const frenchResult = await detectLanguage(frenchText)
  //   const englishResult = await detectLanguage(englishText)
  //   const germanResult = await detectLanguage(germanText)

  //   expect(frenchResult).to.equal('fr')
  //   expect(englishResult).to.equal('en')
  //   expect(germanResult).to.equal('de')
  // })

  it('should handle special characters in prompts', async () => {
    const req = {
      headers: { 'accept-language': 'en-US' }
    }
    const timingInfo = []
    const originalPrompt = '  a  messy    prompt   with   spaces  !@#$%  '
    
    const result = await normalizeAndTranslatePrompt(
      originalPrompt,
      req,
      timingInfo,
      { seed: 123 }
    )

    expect(result).to.be.a('string')
    expect(result).not.to.include('  ')  // Should not have double spaces
    expect(result.length).to.be.greaterThan(originalPrompt.trim().length)
  })

  it('should enhance prompts with GROQ service', async () => {
    const basePrompt = 'a landscape'
    const result = await pimpPrompt(basePrompt, 123)

    expect(result).to.be.a('string')
    expect(result).to.include(basePrompt)
    expect(result.length).to.be.greaterThan(basePrompt.length)
  })
})
