/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Sign-in username; defaults to the one baked into src/auth.ts. */
  readonly VITE_AUTH_USER?: string;
  /** SHA-256 hex of the sign-in password. */
  readonly VITE_AUTH_PASS_SHA256?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
