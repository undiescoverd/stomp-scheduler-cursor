/// <reference types="vite/client" />

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

// Google Analytics gtag types
declare global {
  interface Window {
    gtag?: (
      command: 'event' | 'config' | 'js' | 'set',
      targetId: string | Date,
      config?: Record<string, any>
    ) => void;
  }

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