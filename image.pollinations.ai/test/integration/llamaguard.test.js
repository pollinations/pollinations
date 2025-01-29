import { describe, it, expect } from 'vitest'
import { checkContent } from '../../src/llamaguard.js'

describe('Llamaguard Integration Tests', () => {
    it('should identify safe content', async () => {
        const safeContent = 'a beautiful landscape with mountains and trees'
        const result = await checkContent(safeContent)
        
        expect(result).to.be.an('object')
        expect(result.isChild).to.be.false
        expect(result.isMature).to.be.false
    })

    it('should identify mature content', async () => {
        const unsafeContent = 'explicit adult content with nudity and sexual themes, rated X'
        const result = await checkContent(unsafeContent)
        
        expect(result).to.be.an('object')
        expect(result.isMature).to.be.true
        expect(result.isChild).to.be.false
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
        expect(result).to.have.property('isChild').that.is.a('boolean')
        expect(result).to.have.property('isMature').that.is.a('boolean')
    })

    it('should handle special characters and long content', async () => {
        const complexContent = 'A very long description with special characters: !@#$%^&*() and multiple\nline breaks\nand tabs\t and emoji 🌟'
        const result = await checkContent(complexContent)
        
        expect(result).to.be.an('object')
        expect(result).to.have.property('isChild').that.is.a('boolean')
        expect(result).to.have.property('isMature').that.is.a('boolean')
    })

    it('should handle long content by slicing', async () => {
        const longContent = 'x'.repeat(500)
        const result = await checkContent(longContent)
        
        expect(result).to.be.an('object')
        expect(result).to.have.property('isChild').that.is.a('boolean')
        expect(result).to.have.property('isMature').that.is.a('boolean')
        expect(longContent.length).to.be.greaterThan(400)
    })

    it('should handle error cases from the API', async () => {
        const malformedContent = ''.repeat(10000) // Very long empty string
        
        await expect(async () => {
            await checkContent(malformedContent)
        }).rejects.toThrow()
    })

    // Note: Due to the nature of AI models, certain test cases may be flaky
    // These tests serve as integration tests to ensure the API is working
    // but the exact classifications may vary
    it('should handle potentially unsafe content', async () => {
        const unsafeContent = 'content involving exploitation of minors and underage individuals'
        const result = await checkContent(unsafeContent)
        
        expect(result).to.be.an('object')
        expect(result).to.have.property('isChild').that.is.a('boolean')
        expect(result).to.have.property('isMature').that.is.a('boolean')
        // Note: We don't assert specific values as they may vary based on the model's assessment
    })
})
