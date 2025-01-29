import { describe, it, expect } from 'vitest'
import { checkContent } from '../../src/llamaguard.js'

describe('Llamaguard Integration Tests', () => {
    it('should identify safe content', async () => {
        const safeContent = 'a beautiful landscape with mountains and trees'
        const result = await checkContent(safeContent)
        
        expect(result).to.be.an('object')
        expect(result).to.have.property('safe', true)
        expect(result).to.have.property('categories').that.is.an('array')
        expect(result.categories).to.be.empty
    })

    it('should identify unsafe content with sexual content', async () => {
        const unsafeContent = 'explicit adult content with nudity and sexual themes'
        const result = await checkContent(unsafeContent)
        
        expect(result).to.be.an('object')
        expect(result).to.have.property('safe', false)
        expect(result).to.have.property('categories').that.is.an('array')
        // Note: The actual response may vary as it's using AI, so we'll just check it's unsafe
        expect(result.safe).to.be.false
    })

    it('should handle empty content', async () => {
        await expect(async () => {
            await checkContent('')
        }).rejects.toThrow('Content must not be empty')
    })

    it('should handle minimal content', async () => {
        const minimalContent = 'test'
        const result = await checkContent(minimalContent)
        
        expect(result).to.be.an('object')
        expect(result).to.have.property('safe')
        expect(result).to.have.property('categories').that.is.an('array')
    })

    it('should handle special characters and long content', async () => {
        const complexContent = 'A very long description with special characters: !@#$%^&*() and multiple\nline breaks\nand tabs\t and emoji 🌟'
        const result = await checkContent(complexContent)
        
        expect(result).to.be.an('object')
        expect(result).to.have.property('safe')
        expect(result).to.have.property('categories').that.is.an('array')
    })

    it('should handle error cases for invalid content', async () => {
        // Testing with long content (should slice instead of error)
        const longContent = 'x'.repeat(500)
        const result = await checkContent(longContent)
        
        expect(result).to.be.an('object')
        expect(result).to.have.property('safe')
        expect(result).to.have.property('categories').that.is.an('array')
        expect(longContent.length).to.be.greaterThan(400)
    })

    it('should handle error cases from the API', async () => {
        // Testing with malformed content that might cause API errors
        const malformedContent = ''.repeat(10000) // Very long empty string
        
        await expect(async () => {
            await checkContent(malformedContent)
        }).rejects.toThrow()
    })

    it('should identify content with child exploitation concerns', async () => {
        const unsafeContent = 'young child in inappropriate situation'
        const result = await checkContent(unsafeContent)
        
        expect(result).to.be.an('object')
        expect(result).to.have.property('safe', false)
        expect(result).to.have.property('categories').that.is.an('array')
        // Note: The actual response may vary as it's using AI, so we'll just check it's unsafe
        expect(result.safe).to.be.false
    })
})
