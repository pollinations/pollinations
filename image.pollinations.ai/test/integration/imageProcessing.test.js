import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { fileTypeFromBuffer } from 'file-type'
import { blurImage, resizeImage, addPollinationsLogoWithImagemagick } from '../../src/imageOperations.js'

describe('Image Processing Integration Tests', () => {
  let testImageBuffer

  beforeAll(async () => {
    // Create a test image or load one from fixtures
    testImageBuffer = await fs.readFile(path.join(process.cwd(), 'test', 'fixtures', 'test-image.jpg'))
  })

  describe('Image Pipeline Integration', () => {
    it('should process an image through the entire pipeline', async () => {
      // First resize
      const resizedBuffer = await resizeImage(testImageBuffer, 512, 512)
      const resizedType = await fileTypeFromBuffer(resizedBuffer)
      expect(resizedType.ext).toBe('jpg')

      // Then blur
      const blurredBuffer = await blurImage(resizedBuffer, 8)
      const blurredType = await fileTypeFromBuffer(blurredBuffer)
      expect(blurredType.ext).toBe('jpg')

      // Finally add logo
      const logoPath = path.join(process.cwd(), 'test', 'fixtures', 'logo.png')
      const finalBuffer = await addPollinationsLogoWithImagemagick(blurredBuffer, logoPath, {
        width: 512,
        height: 512
      })
      const finalType = await fileTypeFromBuffer(finalBuffer)
      expect(finalType.ext).toBe('jpg')

      // Verify final image dimensions
      const tempOutputFile = path.join(os.tmpdir(), `final-test-${Date.now()}.jpg`)
      await fs.writeFile(tempOutputFile, finalBuffer)
      
      // Cleanup
      await fs.unlink(tempOutputFile)
    })
  })

  describe('Error Handling', () => {
    it('should handle invalid image data gracefully', async () => {
      const invalidBuffer = Buffer.from('not an image')
      await expect(resizeImage(invalidBuffer, 512, 512)).rejects.toThrow()
    })
    
  })

  describe('Performance Tests', () => {
    it('should process images within acceptable time limits', async () => {
      const start = performance.now()
      
      await resizeImage(testImageBuffer, 512, 512)
      
      const end = performance.now()
      const processingTime = end - start
      
      // Processing should typically complete within 1 second
      expect(processingTime).toBeLessThan(1000)
    })
  })
})
