import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock EventSource
class MockEventSource {
  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.withCredentials = false;
    this.onopen = null;
    this.onmessage = null;
    this.onerror = null;
    this.close = vi.fn();
    this.addEventListener = vi.fn();
    this.removeEventListener = vi.fn();
    this.dispatchEvent = vi.fn();
  }
}

Object.defineProperty(window, 'EventSource', {
  value: MockEventSource,
});