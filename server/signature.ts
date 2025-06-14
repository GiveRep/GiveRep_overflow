export function ToUint8Array(str: string | object): Uint8Array {
  if (typeof str === "object") {
    str = JSON.stringify(str);
  }
  const encoder = new TextEncoder();
  return encoder.encode(str);
}

export function checkSignatureDateValid(signInSignatureMessage: string): boolean {
  const match = signInSignatureMessage.match(/I'm using GiveRep at (.+) with wallet/);
  if (!match) return false;
  
  const timestamp = match[1];
  const signatureDate = new Date(timestamp);
  const now = new Date();
  const hoursDiff = (now.getTime() - signatureDate.getTime()) / (1000 * 60 * 60);
  
  return hoursDiff <= 24;
}