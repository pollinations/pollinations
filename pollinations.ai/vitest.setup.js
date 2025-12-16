// Vitest setup file for DOM matchers and testing utilities
import '@testing-library/jest-dom';

// Add any global test utilities or mocks here
// For example, you can add custom matchers or global test helpers

// Mock window.matchMedia if needed (common for Material-UI components)
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});

// Mock IntersectionObserver if needed (common for lazy loading)
global.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  unobserve() {}
  takeRecords() {
    return [];
  }
};

// Mock EventSource for SSE functionality in tests
import { vi } from 'vitest';

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

// Add any other global test setup here
// This file runs before each test file