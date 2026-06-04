declare module '*.css';

interface ImportMetaEnv {
  readonly VITE_OGRAPH_VERSION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
