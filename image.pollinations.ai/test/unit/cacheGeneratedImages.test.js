import { describe, it, expect, vi, beforeEach } from 'vitest'
import { isImageCached, getCachedImage, cacheImage, memoize } from '../../src/cacheGeneratedImages.js'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'

describe('Image Caching', () => {
  beforeEach(() => {
    // Clear the memory cache before each test
    global.memCache = new Map()
  })

  describe('Basic Cache Operations', () => {
    it('should cache and retrieve an image', async () => {
      const imageData = Buffer.from('fake-image-data')
      const metadata = {
        prompt: 'test prompt',
        model: 'test-model',
        seed: 123
      }
      
      await cacheImage(metadata.prompt, metadata, () => Promise.resolve(imageData))
      expect(isImageCached(metadata.prompt, metadata)).toBe(true)
      
      const cached = await getCachedImage(metadata.prompt, metadata)
      expect(cached).toBeDefined()
      expect(cached.toString()).toBe(imageData.toString())
    })

    it('should return null for non-existent cached image', async () => {
      const metadata = {
        prompt: 'non-existent',
        model: 'test-model',
        seed: 456
      }
      
      expect(isImageCached(metadata.prompt, metadata)).toBe(false)
      const cached = await getCachedImage(metadata.prompt, metadata)
      expect(cached).toBeNull()
    })

    it('should handle special characters in prompt', async () => {
      const imageData = Buffer.from('test-image')
      const metadata = {
        prompt: 'test/with\\special:characters',
        model: 'test-model',
        seed: 789
      }
      
      await cacheImage(metadata.prompt, metadata, () => Promise.resolve(imageData))
      expect(isImageCached(metadata.prompt, metadata)).toBe(true)
      
      const cached = await getCachedImage(metadata.prompt, metadata)
      expect(cached).toBeDefined()
      expect(cached.toString()).toBe(imageData.toString())
    })
  })

  describe('Cache Size Management', () => {
    it('should evict oldest entries when cache is full', async () => {
      // Create entries to fill the cache (MAX_CACHE_SIZE is 2 in test)
      const entries = []
      
      for (let i = 0; i < 3; i++) {
        const imageData = Buffer.from(`image-${i}`)
        const metadata = {
          prompt: `prompt-${i}`,
          model: 'test-model',
          seed: i
        }
        entries.push({ imageData, metadata })
        await cacheImage(metadata.prompt, metadata, () => Promise.resolve(imageData))
      }

      // Verify oldest entry was evicted
      const oldestEntry = entries[0]
      expect(isImageCached(oldestEntry.metadata.prompt, oldestEntry.metadata)).toBe(false)

      // Verify newest entries are still cached
      const newestEntry = entries[entries.length - 1]
      expect(isImageCached(newestEntry.metadata.prompt, newestEntry.metadata)).toBe(true)
    })

    it('should update LRU order when accessing cached items', async () => {
      // Add two items (fills the cache since MAX_CACHE_SIZE is 2)
      const firstData = Buffer.from('first-image')
      const firstMeta = { prompt: 'first', model: 'test', seed: 1 }
      await cacheImage(firstMeta.prompt, firstMeta, () => Promise.resolve(firstData))

      const secondData = Buffer.from('second-image')
      const secondMeta = { prompt: 'second', model: 'test', seed: 2 }
      await cacheImage(secondMeta.prompt, secondMeta, () => Promise.resolve(secondData))

      // Access first item to make it most recently used
      await getCachedImage(firstMeta.prompt, firstMeta)

      // Add third item to trigger eviction
      const thirdData = Buffer.from('third-image')
      const thirdMeta = { prompt: 'third', model: 'test', seed: 3 }
      await cacheImage(thirdMeta.prompt, thirdMeta, () => Promise.resolve(thirdData))

      // Second item should be evicted as it's least recently used
      expect(isImageCached(secondMeta.prompt, secondMeta)).toBe(false)
      expect(isImageCached(firstMeta.prompt, firstMeta)).toBe(true)
      expect(isImageCached(thirdMeta.prompt, thirdMeta)).toBe(true)
    })
  })

  describe('Error Handling', () => {
    it('should handle errors in buffer promise creator', async () => {
      const metadata = {
        prompt: 'error-prompt',
        model: 'test-model',
        seed: 999
      }

      await expect(
        cacheImage(metadata.prompt, metadata, () => Promise.reject(new Error('Failed to create buffer')))
      ).rejects.toThrow('Failed to create buffer')

      expect(isImageCached(metadata.prompt, metadata)).toBe(false)
    })

    it('should handle null prompts', async () => {
      const imageData = Buffer.from('test-image')
      const metadata = {
        model: 'test-model',
        seed: 123
      }
      
      await cacheImage(null, metadata, () => Promise.resolve(imageData))
      expect(isImageCached(null, metadata)).toBe(true)
      
      const cached = await getCachedImage(null, metadata)
      expect(cached).toBeDefined()
      expect(cached.toString()).toBe(imageData.toString())
    })
  })

  describe('Memoization', () => {
    it('should memoize function results', async () => {
      const mockFn = vi.fn()
      const memoized = memoize(mockFn, (...args) => JSON.stringify(args))

      // First call should execute the function
      mockFn.mockReturnValue('result1')
      const result1 = memoized('arg1', 'arg2')
      expect(result1).toBe('result1')
      expect(mockFn).toHaveBeenCalledTimes(1)

      // Second call with same args should return cached result
      const result2 = memoized('arg1', 'arg2')
      expect(result2).toBe('result1') // Should return cached result
      expect(mockFn).toHaveBeenCalledTimes(1) // Should not call function again

      // Call with different args should execute function
      mockFn.mockReturnValue('result3')
      const result3 = memoized('arg3', 'arg4')
      expect(result3).toBe('result3')
      expect(mockFn).toHaveBeenCalledTimes(2)
    })

    it('should use custom key generator if provided', () => {
      const mockFn = vi.fn()
      const customKeyGen = (...args) => args[0] // Only use first argument as key
      const memoized = memoize(mockFn, customKeyGen)

      mockFn.mockReturnValue('result1')
      memoized('key1', 'ignored1')
      expect(mockFn).toHaveBeenCalledTimes(1)

      mockFn.mockReturnValue('different-result')
      memoized('key1', 'ignored2') // Different second arg, but same key
      expect(mockFn).toHaveBeenCalledTimes(1) // Should use cached result
    })
  })
})
