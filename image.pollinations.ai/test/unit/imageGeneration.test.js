import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createAndReturnImageCached } from '../../src/createAndReturnImages.js'
import sharp from 'sharp'

// Create a test image buffer - a 100x100 black square
const testImageBuffer = await sharp({
  create: {
    width: 100,
    height: 100,
    channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 1 }
  }
})
.jpeg()
.toBuffer()

// Mock fetch
const mockFetch = vi.fn()
global.fetch = mockFetch

// Mock external dependencies
vi.mock('../../src/imageOperations.js', () => ({
  addPollinationsLogoWithImagemagick: vi.fn(async (buffer) => buffer),
  nsfwCheck: vi.fn(async () => ({ isChild: false, isMature: false })),
  getLogoPath: vi.fn(() => null)
}))

vi.mock('../../src/availableServers.js', () => ({
  fetchFromLeastBusyFluxServer: vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      image: testImageBuffer.toString('base64'),
      maturity: { isChild: false, isMature: false }
    }),
    buffer: async () => testImageBuffer
  })),
  getNextTurboServerUrl: vi.fn(() => 'http://fake-server.com')
}))

// Mock LlamaGuard
vi.mock('../../src/llamaguard.js', () => ({
  checkContent: vi.fn(async () => ({ isChild: false, isMature: false }))
}))

describe('Image Generation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('createAndReturnImageCached', () => {
    it('should generate and process images', async () => {
      const mockProgress = {
        updateBar: vi.fn(),
        removeBar: vi.fn()
      }

      const safeParams = {
        model: 'flux',
        width: 512,
        height: 512,
        seed: 123,
        nologo: false
      }

      const result = await createAndReturnImageCached(
        'a cute cat',
        safeParams,
        1,
        'original prompt',
        mockProgress,
        'test-request'
      )

      expect(result).toBeDefined()
      expect(result.buffer).toBeInstanceOf(Buffer)
      expect(mockProgress.updateBar).toHaveBeenCalled()
    }, { timeout: 30000 })
  })
})
