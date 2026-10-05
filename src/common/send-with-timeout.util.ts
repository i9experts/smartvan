/* eslint-disable prettier/prettier */
/**
 * Awaits a send (email, SMS, etc.) but gives up after `timeoutMs` so a
 * slow/unresponsive provider can never hang the HTTP response. Never
 * throws — logs success, failure, or timeout and resolves either way,
 * since the caller's own flow (OTP already saved, response already
 * built) doesn't depend on the send actually completing.
 */
export async function sendWithTimeout(
  send: Promise<void>,
  label: string,
  timeoutMs = 8000,
): Promise<void> {
  let timedOut = false;
  const timeout = new Promise<void>((resolve) => {
    setTimeout(() => {
      timedOut = true;
      console.error(`${label}: timed out after ${timeoutMs}ms, continuing without waiting for it`);
      resolve();
    }, timeoutMs);
  });

  try {
    await Promise.race([send, timeout]);
    if (!timedOut) {
      console.log(`${label}: sent`);
    }
  } catch (err: any) {
    console.error(`${label}: failed —`, err?.message || err);
  }
}
