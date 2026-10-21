// Browser Web Crypto; no Math.random, persistence or network call.
export function generateRiderTemporaryPassword() {
  return Array.from(globalThis.crypto.getRandomValues(new Uint8Array(24)),byte=>byte.toString(16).padStart(2,'0')).join('');
}
