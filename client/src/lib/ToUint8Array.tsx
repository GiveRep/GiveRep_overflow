export function ToUint8Array(str: string | object) {
  if (typeof str === "object") {
    str = JSON.stringify(str);
  }
  const encoder = new TextEncoder();
  return encoder.encode(str);
}
