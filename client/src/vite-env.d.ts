/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPER_ADMIN_OBJECT_ID: string
  readonly VITE_ADMIN_SUI_WALLET_PUBLIC_ADDRESS: string
  // Add other environment variables as needed
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}