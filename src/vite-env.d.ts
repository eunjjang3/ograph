declare module '*.css';

declare const __OGRAPH_DEBUG_RUNTIME__: boolean;

interface ImportMetaEnv {
  readonly VITE_OGRAPH_VERSION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
