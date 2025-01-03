import { vi } from 'vitest'

// Mock translations for testing
const mockTranslations = {
  "Ein schöner Sonnenuntergang am Strand": "A beautiful sunset at the beach",
  "Ein fantastisches Schloss": "A fantastic castle",
  "Ein großer blauer Wal": "A large blue whale",
  "Une belle fleur rouge": "A beautiful red flower",
  "Ein blauer Schmetterling": "A blue butterfly",
  "Una montaña nevada": "A snowy mountain"
}

export const mockTranslate = async (text) => {
  // Return original text if it's English or contains special tokens
  if (text.includes('--') || /^[a-zA-Z0-9\s.,!?-]+$/.test(text)) {
    return text
  }
  
  // Return mock translation or original text if not found
  return mockTranslations[text] || text
}

export const setupTranslationMock = () => {
  // Mock translateIfNecessary
  vi.mock('../../src/translateIfNecessary.js', () => ({
    translateIfNecessary: async (text) => mockTranslate(text)
  }))
  
  // Mock normalizeAndTranslatePrompt
  vi.mock('../../src/normalizeAndTranslatePrompt.js', () => ({
    normalizeAndTranslatePrompt: async (text) => mockTranslate(text)
  }))
}
