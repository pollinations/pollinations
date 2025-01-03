import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fileTypeFromBuffer } from 'file-type'
import { addPollinationsLogoWithImagemagick, getLogoPath, resizeImage } from '../../src/imageOperations.js'
import { MODELS } from '../../src/models.js'
import { fetchFromLeastBusyFluxServer, getNextTurboServerUrl } from '../../src/availableServers.js'
import { writeExifMetadata } from '../../src/writeExifMetadata.js'
import { sanitizeString } from '../../src/translateIfNecessary.js'
import sharp from 'sharp'
import fetch from 'node-fetch'
import { calculateScaledDimensions, callComfyUI, callMeoow, callMeoow2, calculateClosestAspectRatio, convertToJpeg, createAndReturnImageCached } from '../../src/createAndReturnImages.js'

// Mock dependencies
vi.mock('node-fetch')
vi.mock('file-type')
vi.mock('sharp')
vi.mock('../../src/imageOperations.js')
vi.mock('../../src/availableServers.js')
vi.mock('../../src/writeExifMetadata.js')
vi.mock('../../src/translateIfNecessary.js')

// Mock models
vi.mock('../../src/models.js', () => ({
  MODELS: {
    'flux': { type: 'comfyui' },
    'flux-realism': { type: 'comfyui' },
    'meoow': { type: 'meoow' },
    'meoow2': { type: 'meoow2' }
  }
}))

describe('Image Creation and Processing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetAllMocks()
    
    // Setup default mock implementations
    fileTypeFromBuffer.mockResolvedValue({ ext: 'jpg' })
    sharp.mockReturnValue({
      metadata: vi.fn().mockResolvedValue({ width: 512, height: 512 }),
      jpeg: vi.fn().mockReturnThis(),
      toBuffer: vi.fn().mockResolvedValue(Buffer.from('test-image'))
    })

    // Mock fetch for different endpoints
    fetch.mockImplementation((url) => {
      const response = {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Map([['content-type', 'image/jpeg']]),
        text: () => Promise.resolve('Error text'),
        json: () => Promise.resolve({
          images: ['base64-image-data'],
          data: [{ url: 'http://example.com/image.jpg', b64_json: 'base64-image-data' }]
        }),
        buffer: () => Promise.resolve(Buffer.from('test-image'))
      }

      return Promise.resolve(response)
    })

    getNextTurboServerUrl.mockResolvedValue('http://test-turbo-server')
    fetchFromLeastBusyFluxServer.mockResolvedValue('http://test-flux-server')
    writeExifMetadata.mockResolvedValue(Buffer.from('test-image-with-metadata'))
    sanitizeString.mockReturnValue('sanitized-prompt')
  })

  describe('calculateScaledDimensions', () => {
    it('should maintain dimensions if already at target size', () => {
      const { scaledWidth, scaledHeight, scalingFactor } = calculateScaledDimensions(1024, 1024)
      expect(scaledWidth).toBe(1024)
      expect(scaledHeight).toBe(1024)
      expect(scalingFactor).toBe(1)
    })

    it('should scale up smaller images', () => {
      const { scaledWidth, scaledHeight, scalingFactor } = calculateScaledDimensions(512, 512)
      expect(scaledWidth).toBe(1024)
      expect(scaledHeight).toBe(1024)
      expect(scalingFactor).toBe(2)
    })

    it('should maintain aspect ratio when scaling', () => {
      const { scaledWidth, scaledHeight } = calculateScaledDimensions(800, 400)
      expect(scaledWidth / scaledHeight).toBeCloseTo(2) // Original aspect ratio was 2:1
    })
  })

  describe('calculateClosestAspectRatio', () => {
    it('should return closest predefined aspect ratio', () => {
      expect(calculateClosestAspectRatio(1024, 1024)).toBe('1:1')
      expect(calculateClosestAspectRatio(1024, 768)).toBe('4:3')
      expect(calculateClosestAspectRatio(1920, 1080)).toBe('16:9')
    })
  })

  describe('convertToJpeg', () => {
    it('should convert non-jpeg images to jpeg', async () => {
      const buffer = Buffer.from('test-image')
      fileTypeFromBuffer.mockResolvedValue({ ext: 'png' })
      
      await convertToJpeg(buffer)
      expect(sharp).toHaveBeenCalledWith(buffer)
    })

    it('should not convert jpeg images', async () => {
      const buffer = Buffer.from('test-image')
      fileTypeFromBuffer.mockResolvedValue({ ext: 'jpg' })
      
      const result = await convertToJpeg(buffer)
      expect(sharp).not.toHaveBeenCalled()
      expect(result).toEqual(buffer)
    })

    it('should handle conversion errors', async () => {
      const buffer = Buffer.from('test-image')
      fileTypeFromBuffer.mockResolvedValue({ ext: 'png' })
      sharp.mockReturnValue({
        metadata: vi.fn().mockRejectedValue(new Error('Conversion failed')),
        jpeg: vi.fn().mockReturnThis(),
        toBuffer: vi.fn().mockRejectedValue(new Error('Conversion failed'))
      })

      await expect(convertToJpeg(buffer))
        .rejects.toThrow('Conversion failed')
    })
  })

  describe('createAndReturnImageCached', () => {
    it('placeholder test', () => {
      expect(true).toBe(true)
    })
  })

  describe('API Calls', () => {
    describe('callComfyUI', () => {
      beforeEach(() => {
        getNextTurboServerUrl.mockResolvedValue('http://test-turbo-server')
      })

      it('placeholder test', () => {
        expect(true).toBe(true)
      })
    })

    describe('callMeoow', () => {
      it('should call Meoow API and process response', async () => {
        const prompt = 'test prompt'
        const safeParams = {
          model: 'meoow',
          width: 512,
          height: 512
        }

        const result = await callMeoow(prompt, safeParams)
        expect(fetch).toHaveBeenCalled()
        expect(result).toBeDefined()
        expect(result.buffer).toBeDefined()
      })

      it('should handle API errors', async () => {
        const prompt = 'test prompt'
        const safeParams = {
          model: 'meoow',
          width: 512,
          height: 512
        }

        fetch.mockImplementationOnce(() => Promise.resolve({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          headers: new Map([['content-type', 'text/plain']]),
          text: () => Promise.resolve('Server error')
        }))

        await expect(callMeoow(prompt, safeParams))
          .rejects.toThrow('Server responded with 500')
      })
    })

    describe('callMeoow2', () => {
      it('should call Meoow2 API and process response', async () => {
        const prompt = 'test prompt'
        const safeParams = {
          model: 'meoow2',
          width: 512,
          height: 512
        }

        const result = await callMeoow2(prompt, safeParams)
        expect(fetch).toHaveBeenCalled()
        expect(result).toBeDefined()
        expect(result.buffer).toBeDefined()
      })

      it('should handle API errors', async () => {
        const prompt = 'test prompt'
        const safeParams = {
          model: 'meoow2',
          width: 512,
          height: 512
        }

        fetch.mockImplementationOnce(() => Promise.resolve({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          headers: new Map([['content-type', 'text/plain']]),
          text: () => Promise.resolve('Server error')
        }))

        await expect(callMeoow2(prompt, safeParams))
          .rejects.toThrow('Server responded with 500')
      })
    })
  })
})
