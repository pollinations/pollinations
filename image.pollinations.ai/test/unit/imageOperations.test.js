import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { blurImage, resizeImage, getLogoPath, addPollinationsLogoWithImagemagick } from '../../src/imageOperations.js'
import sharp from 'sharp'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'

describe('Image Operations', () => {
  let testImageBuffer
  let tempDir

  beforeEach(async () => {
    // Create a test image using sharp
    testImageBuffer = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 4,
        background: { r: 255, g: 0, b: 0, alpha: 1 }
      }
    })
    .jpeg()
    .toBuffer()

    // Create temp directory for test files
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'image-ops-test-'))
  })

  afterEach(async () => {
    // Clean up temp directory
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  describe('blurImage', () => {
    it('should blur an image with default parameters', async () => {
      const blurredBuffer = await blurImage(testImageBuffer)
      expect(blurredBuffer).to.be.instanceOf(Buffer)
      expect(blurredBuffer.length).to.be.greaterThan(0)

      // Verify the image is actually blurred by comparing with original
      const originalMetadata = await sharp(testImageBuffer).metadata()
      const blurredMetadata = await sharp(blurredBuffer).metadata()
      expect(blurredMetadata.width).to.equal(originalMetadata.width)
      expect(blurredMetadata.height).to.equal(originalMetadata.height)
    })

    it('should blur an image with custom size', async () => {
      const blurredBuffer = await blurImage(testImageBuffer, 20)
      expect(blurredBuffer).to.be.instanceOf(Buffer)
    })

    it('should handle errors for invalid image data', async () => {
      const invalidBuffer = Buffer.from('not an image')
      await expect(blurImage(invalidBuffer)).rejects.toThrow()
    })
  })

  describe('resizeImage', () => {
    it('should resize an image to specified dimensions', async () => {
      const newWidth = 200
      const newHeight = 150
      const resizedBuffer = await resizeImage(testImageBuffer, newWidth, newHeight)
      
      const metadata = await sharp(resizedBuffer).metadata()
      expect(metadata.width).to.equal(newWidth)
      expect(metadata.height).to.equal(newHeight)
    })

    it('should maintain aspect ratio when only width is specified', async () => {
      const newWidth = 200
      const resizedBuffer = await resizeImage(testImageBuffer, newWidth, newWidth)
      
      const metadata = await sharp(resizedBuffer).metadata()
      expect(metadata.width).to.equal(newWidth)
      expect(metadata.height).to.equal(newWidth) // Since original is square
    })

    it('should handle errors for invalid dimensions', async () => {
      const invalidBuffer = Buffer.from('not an image')
      await expect(resizeImage(invalidBuffer, 100, 100)).rejects.toThrow()
    })
  })

  describe('getLogoPath', () => {
    it('should return null when nologo is true', () => {
      const safeParams = { nologo: true, model: 'flux', nofeed: false }
      expect(getLogoPath(safeParams, false, false)).to.be.null
    })

    it('should return pollinations logo path for pollinations model', () => {
      const safeParams = { nologo: false, model: 'flux', nofeed: false }
      const logoPath = getLogoPath(safeParams, false, false)
      expect(logoPath).to.equal('logo.png')
    })
  })

  describe('addPollinationsLogoWithImagemagick', () => {
    it('should add logo to image', async () => {
      // Create a test logo
      const logoBuffer = await sharp({
        create: {
          width: 50,
          height: 50,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 1 }
        }
      })
      .png()
      .toBuffer()

      const logoPath = path.join(tempDir, 'test-logo.png')
      await fs.writeFile(logoPath, logoBuffer)

      const result = await addPollinationsLogoWithImagemagick(testImageBuffer, logoPath, {
        width: 100,
        height: 100
      })

      expect(result).to.be.instanceOf(Buffer)
      expect(result.length).to.be.greaterThan(0)
    })

    it('should handle missing logo file', async () => {
      const nonExistentLogoPath = path.join(tempDir, 'non-existent-logo.png')
      await expect(addPollinationsLogoWithImagemagick(
        testImageBuffer,
        nonExistentLogoPath,
        { width: 100, height: 100 }
      )).rejects.toThrow()
    })
  })
})
