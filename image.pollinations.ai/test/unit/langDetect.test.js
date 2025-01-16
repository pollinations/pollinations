import { describe, it, expect, vi } from 'vitest';
import { detectEnglish } from '../../src/langDetect.js';
import { exec } from 'child_process';

// Mock child_process.exec
vi.mock('child_process', () => ({
  exec: vi.fn()
}));

describe('detectEnglish', () => {
  it('should return true for English text', async () => {
    exec.mockImplementation((cmd, callback) => callback(null, 'en\n', ''));
    const result = await detectEnglish('Hello world');
    expect(result).toBe(true);
    expect(exec).toHaveBeenCalledWith('python langdetect.py "Hello world"', expect.any(Function));
  });

  it('should return false for non-English text', async () => {
    exec.mockImplementation((cmd, callback) => callback(null, 'fr\n', ''));
    const result = await detectEnglish('Bonjour le monde');
    expect(result).toBe(false);
    expect(exec).toHaveBeenCalledWith('python langdetect.py "Bonjour le monde"', expect.any(Function));
  });

  it('should handle execution errors', async () => {
    const error = new Error('Command failed');
    exec.mockImplementation((cmd, callback) => callback(error, '', 'Command failed'));
    
    await expect(detectEnglish('Test text')).rejects.toThrow('Command failed');
    expect(exec).toHaveBeenCalledWith('python langdetect.py "Test text"', expect.any(Function));
  });

  // Reset mocks after each test
  afterEach(() => {
    vi.clearAllMocks();
  });
});
