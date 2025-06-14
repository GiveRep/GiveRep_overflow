// Environment variable helpers with type safety

// Default values for Sui testnet/mainnet
const DEFAULT_SUPER_ADMIN_OBJECT_ID =
  "0xea04af5e12aae9e6d9251af215fdbdc0ce6542b0d41ac6fc5b65cc7461e7aa2c"; // Default testnet value
const DEFAULT_ADMIN_WALLET =
  "0x02e48a5f5156b3db622be157065ea3e931a8e63de3dcc443869285c5518be79c";

// Log warnings when using defaults
if (!import.meta.env.VITE_SUPER_ADMIN_OBJECT_ID) {
  console.warn(
    "VITE_SUPER_ADMIN_OBJECT_ID not set, using default testnet value:",
    DEFAULT_SUPER_ADMIN_OBJECT_ID
  );
}

if (!import.meta.env.VITE_ADMIN_SUI_WALLET_PUBLIC_ADDRESS) {
  console.warn(
    "VITE_ADMIN_SUI_WALLET_PUBLIC_ADDRESS not set, using default value:",
    DEFAULT_ADMIN_WALLET
  );
}

export const env = {
  VITE_SUPER_ADMIN_OBJECT_ID:
    import.meta.env.VITE_SUPER_ADMIN_OBJECT_ID || DEFAULT_SUPER_ADMIN_OBJECT_ID,
  VITE_ADMIN_SUI_WALLET_PUBLIC_ADDRESS:
    import.meta.env.VITE_ADMIN_SUI_WALLET_PUBLIC_ADDRESS ||
    DEFAULT_ADMIN_WALLET,
} as const;

// Helper function to ensure environment variables are set
export function getRequiredEnv(key: keyof typeof env): string {
  const value = env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

// Safe getter with fallback
export function getEnv(key: keyof typeof env, fallback?: string): string {
  const value = env[key];
  if (!value && fallback) {
    console.warn(`Environment variable ${key} not found`);
    return fallback;
  }
  return value || fallback || "";
}
