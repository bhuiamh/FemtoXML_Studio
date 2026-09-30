/**
 * Sign-in gate.
 *
 * IMPORTANT — what this is and is not:
 * FemtoXML Studio is a browser-only app with no server, so this check runs in
 * the user's own browser. It keeps casual visitors out of a shared or hosted
 * instance; it is NOT a security boundary. Anyone who can open the devtools can
 * bypass it, and everything the app touches (the XML you load) is local anyway.
 *
 * The password is therefore stored as a SHA-256 hash rather than plaintext, so
 * the literal never appears in the repository or the JavaScript bundle. Both
 * values can be overridden at build time without touching the source:
 *
 *   VITE_AUTH_USER=someone
 *   VITE_AUTH_PASS_SHA256=<sha256 hex of the password>
 *
 * Generate a hash with:
 *   node -e "console.log(require('crypto').createHash('sha256').update('YOUR PASSWORD').digest('hex'))"
 */

const USER: string = import.meta.env.VITE_AUTH_USER ?? "nybsys";

/** SHA-256 of the shipped default password. */
const PASS_SHA256: string =
  import.meta.env.VITE_AUTH_PASS_SHA256 ??
  "8a68fb0f6ea9bcd7f187db6509165005fac1d638eefc4ea382a06f25bf1996cb";

const SESSION_KEY = "femtoxml.session";

/** Marker stored on a successful sign-in; not a token, just a flag. */
const SESSION_VALUE = "1";

export async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Constant-time-ish compare, so a wrong password can't be timed out character by character. */
function equals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyCredentials(
  username: string,
  password: string,
): Promise<boolean> {
  const hash = await sha256Hex(password);
  return username.trim().toLowerCase() === USER.toLowerCase() && equals(hash, PASS_SHA256);
}

/** `remember` keeps the session across browser restarts; otherwise it ends with the tab. */
export function startSession(remember: boolean) {
  try {
    (remember ? localStorage : sessionStorage).setItem(SESSION_KEY, SESSION_VALUE);
  } catch {
    // Storage blocked — the user simply signs in again next time.
  }
}

export function endSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // Nothing to clean up.
  }
}

export function hasSession(): boolean {
  try {
    return (
      localStorage.getItem(SESSION_KEY) === SESSION_VALUE ||
      sessionStorage.getItem(SESSION_KEY) === SESSION_VALUE
    );
  } catch {
    return false;
  }
}

export const AUTH_USER = USER;
