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
global.EventSource = class EventSource {
  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.onmessage = null;
    this.onerror = null;
    this.onopen = null;
    
    // Simulate connection opening
    setTimeout(() => {
      this.readyState = 1;
      if (this.onopen) this.onopen();
    }, 0);
  }
  
  close() {
    this.readyState = 2;
  }
  
  // Helper method for tests to simulate messages
  simulateMessage(data) {
    if (this.onmessage) {
      this.onmessage({ data: JSON.stringify(data) });
    }
  }
  
  // Helper method for tests to simulate errors
  simulateError() {
    if (this.onerror) {
      this.onerror(new Error('Connection error'));
    }
  }
};

// Add any other global test setup here
// This file runs before each test file