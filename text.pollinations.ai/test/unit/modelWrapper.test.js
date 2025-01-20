import { expect, test, vi, describe, beforeEach } from 'vitest';
import { createModelWithFallback } from '../../modelWrapper.js';

describe('modelWrapper', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    test('should use primary model when it succeeds', async () => {
        const primaryModel = vi.fn().mockResolvedValue({ result: 'primary' });
        const fallbackModel = vi.fn().mockResolvedValue({ result: 'fallback' });

        const wrappedModel = createModelWithFallback(primaryModel, fallbackModel, {
            primaryName: 'test-primary',
            fallbackName: 'test-fallback'
        });

        const result = await wrappedModel(['test message'], { option: 'value' });

        expect(result).toEqual({ result: 'primary' });
        expect(primaryModel).toHaveBeenCalledWith(['test message'], { option: 'value' });
        expect(fallbackModel).not.toHaveBeenCalled();
    });

    test('should use fallback model when primary fails', async () => {
        const primaryModel = vi.fn().mockRejectedValue(new Error('Primary failed'));
        const fallbackModel = vi.fn().mockResolvedValue({ result: 'fallback' });

        const wrappedModel = createModelWithFallback(primaryModel, fallbackModel, {
            primaryName: 'test-primary',
            fallbackName: 'test-fallback'
        });

        const result = await wrappedModel(['test message'], { option: 'value' });

        expect(result).toEqual({ result: 'fallback' });
        expect(primaryModel).toHaveBeenCalledWith(['test message'], { option: 'value' });
        expect(fallbackModel).toHaveBeenCalledWith(['test message'], { option: 'value' });
    });

    test('should timeout primary model after specified duration', async () => {
        const primaryModel = vi.fn().mockImplementation(() => new Promise(resolve => {
            setTimeout(() => resolve({ result: 'primary' }), 2000);
        }));
        const fallbackModel = vi.fn().mockResolvedValue({ result: 'fallback' });

        const wrappedModel = createModelWithFallback(primaryModel, fallbackModel, {
            timeout: 1000,
            primaryName: 'test-primary',
            fallbackName: 'test-fallback'
        });

        const modelPromise = wrappedModel(['test message'], { option: 'value' });
        
        // Fast-forward time past timeout
        await vi.advanceTimersByTimeAsync(1500);
        
        const result = await modelPromise;

        expect(result).toEqual({ result: 'fallback' });
        expect(primaryModel).toHaveBeenCalledWith(['test message'], { option: 'value' });
        expect(fallbackModel).toHaveBeenCalledWith(['test message'], { option: 'value' });
    });

    test('should throw error when both models fail', async () => {
        const primaryModel = vi.fn().mockRejectedValue(new Error('Primary failed'));
        const fallbackModel = vi.fn().mockRejectedValue(new Error('Fallback failed'));

        const wrappedModel = createModelWithFallback(primaryModel, fallbackModel, {
            primaryName: 'test-primary',
            fallbackName: 'test-fallback'
        });

        await expect(wrappedModel(['test message'], { option: 'value' }))
            .rejects.toThrow('Fallback failed');
        
        expect(primaryModel).toHaveBeenCalledWith(['test message'], { option: 'value' });
        expect(fallbackModel).toHaveBeenCalledWith(['test message'], { option: 'value' });
    });

    test('should throw original error when no fallback is provided', async () => {
        const primaryModel = vi.fn().mockRejectedValue(new Error('Primary failed'));

        const wrappedModel = createModelWithFallback(primaryModel, null, {
            primaryName: 'test-primary'
        });

        await expect(wrappedModel(['test message'], { option: 'value' }))
            .rejects.toThrow('Primary failed');
        
        expect(primaryModel).toHaveBeenCalledWith(['test message'], { option: 'value' });
    });
});