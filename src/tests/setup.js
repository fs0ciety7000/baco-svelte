import '@testing-library/jest-dom';
import { expect, afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/svelte';

// Cleanup after each test
afterEach(() => {
    cleanup();
});

// Mock SvelteKit environment variables
vi.mock('$env/static/public', () => ({
    PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
    PUBLIC_SUPABASE_ANON_KEY: 'test-key'
}));

// Mock window.matchMedia
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
        dispatchEvent: () => {}
    })
});

// Mock navigator.clipboard
Object.defineProperty(navigator, 'clipboard', {
    writable: true,
    value: {
        writeText: () => Promise.resolve(),
        write: () => Promise.resolve(),
        readText: () => Promise.resolve(''),
        read: () => Promise.resolve([])
    }
});
