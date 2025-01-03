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

    expect(result).to.be.an('object')
    expect(result).to.have.property('prompt').that.is.a('string')
    expect(result).to.have.property('wasPimped', true)
    expect(result.prompt.length).to.be.greaterThan(originalPrompt.length)
    expect(result.prompt).to.include(originalPrompt)
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

    expect(result).to.be.an('object')
    expect(result).to.have.property('prompt').that.is.a('string')
    expect(result).to.have.property('wasPimped', true)
    expect(result.prompt.length).to.be.greaterThan(originalPrompt.length)
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

    expect(result).to.be.an('object')
    expect(result).to.have.property('prompt', originalPrompt)
    expect(result).to.have.property('wasPimped', false)
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

    expect(result).to.be.an('object')
    expect(result).to.have.property('prompt').that.is.a('string')
    expect(result).to.have.property('wasPimped', true)
    expect(result.prompt).not.to.include('  ')  // Should not have double spaces
    expect(result.prompt.length).to.be.greaterThan(originalPrompt.trim().length)
  })

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

    expect(result).to.be.an('object')
    expect(result).to.have.property('prompt').that.is.a('string')
    expect(result).to.have.property('wasPimped', true)
    expect(result.prompt).not.to.include('  ')  // Should not have double spaces
    expect(result.prompt.length).to.be.greaterThan(originalPrompt.trim().length)
  })

  it('should enhance prompts with GROQ service', async () => {
    const basePrompt = 'a landscape'
    const result = await pimpPrompt(basePrompt, 123)

    expect(result).to.be.a('string')
    expect(result).to.include(basePrompt)
    expect(result.length).to.be.greaterThan(basePrompt.length)
  })
})
