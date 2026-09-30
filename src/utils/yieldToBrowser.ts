/**
 * Hand control back to the browser for one frame.
 *
 * Parsing a 2 MB device XML is synchronous and takes a few hundred
 * milliseconds; without a yield between files the loading animation freezes
 * exactly while it is meant to be reassuring. Awaiting this between files lets
 * the browser paint the progress that was just set.
 */
export function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => setTimeout(resolve, 0));
  });
}
