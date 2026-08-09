/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly BUILD_VERSION: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
