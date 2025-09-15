// Global type declarations for the STOMP Scheduler frontend

// Google Analytics gtag types
declare global {
  interface Window {
    gtag?: (
      command: 'event' | 'config' | 'js' | 'set',
      targetId: string | Date,
      config?: Record<string, any>
    ) => void;
  }

  // Global gtag function
  function gtag(
    command: 'event' | 'config' | 'js' | 'set',
    targetId: string | Date,
    config?: Record<string, any>
  ): void;
}

// Performance API extensions
interface Performance {
  memory?: {
    usedJSHeapSize: number;
    totalJSHeapSize: number;
    jsHeapSizeLimit: number;
  };
}

// Extend process for environment variables in browser
declare namespace NodeJS {
  interface ProcessEnv {
    readonly NODE_ENV: 'development' | 'production' | 'test';
    readonly VITE_API_URL?: string;
    readonly VITE_GA_MEASUREMENT_ID?: string;
  }
}

// Vite environment variables
interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_GA_MEASUREMENT_ID?: string;
  readonly VITE_ENABLE_ANALYTICS?: string;
  readonly MODE: 'development' | 'production' | 'test';
  readonly DEV: boolean;
  readonly PROD: boolean;
  readonly SSR: boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Service Worker types
interface ServiceWorkerGlobalScope {
  skipWaiting(): Promise<void>;
}

// Export to make this a module
export {};