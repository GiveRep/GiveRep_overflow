import { verifyPersonalMessageSignature } from '@mysten/sui/verify';
import { ToUint8Array, checkSignatureDateValid } from '../utils/signature';

/**
 * Verify a SUI wallet signature
 * @param message The message that was signed
 * @param signature The signature to verify
 * @param expectedAddress The expected SUI address
 * @returns Promise<boolean> indicating if the signature is valid
 */
export async function verifySuiSignature(
  message: string,
  signature: string,
  expectedAddress: string
): Promise<boolean> {
  try {
    // Check if signature is expired (24 hours)
    if (!checkSignatureDateValid(message)) {
      console.log('Signature expired');
      return false;
    }
    
    // Verify signature
    const publicKey = await verifyPersonalMessageSignature(
      ToUint8Array(message),
      signature
    );
    
    const recoveredAddress = publicKey.toSuiAddress();
    return recoveredAddress.toLowerCase() === expectedAddress.toLowerCase();
  } catch (error) {
    console.error('Error verifying SUI signature:', error);
    return false;
  }
}

/**
 * Generate a standardized sign-in message for SUI wallet
 * @param address The SUI address
 * @param appName The application name (default: 'GiveRep')
 * @returns The formatted message to sign
 */
export function generateSignInMessage(address: string, appName: string = 'GiveRep'): string {
  const now = new Date().toISOString();
  return `I'm using ${appName} at ${now} with wallet ${address}`;
}

/**
 * Parse a sign-in message to extract the timestamp
 * @param message The sign-in message
 * @returns The timestamp or null if invalid format
 */
export function parseSignInMessageTimestamp(message: string): Date | null {
  const match = message.match(/I'm using .+ at (.+) with wallet/);
  if (!match) return null;
  
  try {
    return new Date(match[1]);
  } catch {
    return null;
  }
}

/**
 * Validate SUI address format
 * @param address The address to validate
 * @returns boolean indicating if the address is valid
 */
export function isValidSuiAddress(address: string): boolean {
  // SUI addresses are 66 characters long (0x + 64 hex chars)
  return /^0x[a-fA-F0-9]{64}$/.test(address);
}

/**
 * Normalize SUI address to lowercase
 * @param address The address to normalize
 * @returns The normalized address
 */
export function normalizeSuiAddress(address: string): string {
  return address.toLowerCase();
}