import { describe, it, expect } from 'vitest'
import { checkContent } from '../../src/llamaguard.js'

describe('Llamaguard Integration Tests', () => {
    it('should identify safe content', async () => {
        const safeContent = 'a beautiful landscape with mountains and trees'
        const result = await checkContent(safeContent)
        
        expect(result).to.be.an('object')
        expect(result.isChild).to.be.false
        expect(result.isMature).to.be.false
        expect(result.unsafe).to.be.false
        expect(result.categories).to.be.an('array').that.is.empty
    })

    it('should identify mature content', async () => {
        const unsafeContent = 'explicit adult content with nudity and sexual themes, rated X'
        const result = await checkContent(unsafeContent)
        
        expect(result).to.be.an('object')
        expect(result.isMature).to.be.true
        expect(result.isChild).to.be.false
        expect(result.unsafe).to.be.true
        expect(result.categories).to.be.an('array')
        expect(result.categories).to.include('S12') // Sexual Content
    })

    it('should handle empty content', async () => {
        try {
            await checkContent('');
            throw new Error('Expected error was not thrown');
        } catch (error) {
            expect(error.message).to.equal('Content must not be empty');
        }
    })

    it('should handle minimal content', async () => {
        const minimalContent = 'test'
        const result = await checkContent(minimalContent)
        
        expect(result).to.be.an('object')
        expect(result).to.have.all.keys(['isChild', 'isMature', 'categories', 'unsafe'])
        expect(result.categories).to.be.an('array')
        expect(result.unsafe).to.be.a('boolean')
    })

    it('should handle special characters and long content', async () => {
        const complexContent = 'A very long description with special characters: !@#$%^&*() and multiple\nline breaks\nand tabs\t and emoji 🌟'
        const result = await checkContent(complexContent)
        
        expect(result).to.be.an('object')
        expect(result).to.have.all.keys(['isChild', 'isMature', 'categories', 'unsafe'])
        expect(result.categories).to.be.an('array')
        expect(result.unsafe).to.be.a('boolean')
    })

    it('should handle long content', async () => {
        const longContent = 'a'.repeat(10000);
        const result = await checkContent(longContent);
        expect(result).to.have.property('unsafe');
        expect(result).to.have.property('categories');
        expect(result).to.have.property('isChild');
        expect(result).to.have.property('isMature');
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
    it('should handle potentially unsafe content with multiple categories', async () => {
        const unsafeContent = 'explicit adult content with nudity'
        const result = await checkContent(unsafeContent)
        
        expect(result).to.be.an('object')
        expect(result).to.have.all.keys(['isChild', 'isMature', 'categories', 'unsafe'])
        expect(result.categories).to.be.an('array')
        expect(result.unsafe).to.be.true
        // Should detect sexual content
        expect(result.categories).to.include('S12')
    })

    it('should handle child exploitation content', async () => {
        const unsafeContent = 'explicit content involving minors and child exploitation'
        const result = await checkContent(unsafeContent)
        
        expect(result).to.be.an('object')
        expect(result.isChild).to.be.true
        expect(result.unsafe).to.be.true
        expect(result.categories).to.be.an('array')
        expect(result.categories).to.include('S4')  // Child Exploitation
    })

    it('should handle the text "child porn", returning either S4 or S12', async () => {
        const unsafeContent = 'child porn'
        const result = await checkContent(unsafeContent)
        
        expect(result).to.be.an('object')
        expect(result.isChild).to.be.true
        expect(result.unsafe).to.be.true
        expect(result.categories).to.be.an('array')
        // Should have at least one of these categories
        expect(result.categories.some(c => ['S4', 'S12'].includes(c))).to.be.true
    })

    it('should normalize O4 and O12 category codes', async () => {
        const unsafeContent = 'explicit content involving minors'
        const result = await checkContent(unsafeContent)
        
        expect(result).to.be.an('object')
        expect(result.categories).to.be.an('array')
        // If categories include child exploitation, it should be S4 not O4
        if (result.isChild) {
            expect(result.categories).to.include('S4')
            expect(result.categories).to.not.include('O4')
        }
        // If categories include sexual content, it should be S12 not O12
        if (result.isMature) {
            expect(result.categories).to.include('S12')
            expect(result.categories).to.not.include('O12')
        }
    })
})
