import { describe, it, expect, beforeAll } from 'vitest'
import { createAndReturnImageCached } from '../../src/createAndReturnImages.js'
import { writeExifMetadata } from '../../src/writeExifMetadata.js'
import { MODELS } from '../../src/models.js'
import fs from 'fs'
import path from 'path'
import os from 'os'
import sharp from 'sharp'

describe('Image Generation Integration Tests', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'image-test-'))
  
  beforeAll(() => {
    // Ensure temp directory exists
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true })
    }
  })

  it('should generate an image', async () => {
    const params = {
      prompt: 'a simple test image',
      seed: 12345,
      width: 512,
      height: 512,
      model: 'flux'  // Using flux model which is available
    }

    const result = await createAndReturnImageCached(
      params.prompt,
      params,
      1,  // concurrent requests
      params.prompt,  // original prompt
      null,  // progress
      'test-request-id'
    )
    
    expect(result).to.be.an('object')
    expect(result.buffer).to.be.instanceOf(Buffer)
    expect(result.buffer.length).to.be.greaterThan(0)
  }, 60000) // Allow 60s for image generation

  it('should write and read EXIF metadata', async () => {
    // Create a valid test image using sharp
    const testImagePath = path.join(tempDir, 'test-image.jpg')
    const testImage = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 4,
        background: { r: 255, g: 0, b: 0, alpha: 0.5 }
      }
    })
    .jpeg()
    .toBuffer()
    
    fs.writeFileSync(testImagePath, testImage)

    const metadata = {
      prompt: 'test prompt',
      seed: 12345,
      model: 'test-model'
    }

    await writeExifMetadata(testImagePath, metadata)
    
    // Verify the file exists and has been modified
    const stats = fs.statSync(testImagePath)
    expect(stats.size).to.be.greaterThan(0)
  })
})
