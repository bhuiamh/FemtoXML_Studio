/**
 * Hand control back to the browser for one frame.
 *
 * Parsing a 2 MB device XML is synchronous and takes a few hundred
 * milliseconds; without a yield between files the loading animation freezes
 * exactly while it is meant to be reassuring. Awaiting this between files lets
 * the browser paint the progress that was just set.
 *
 * requestAnimationFrame alone is not safe here: a browser stops firing it in a
 * hidden tab, so a load started and then backgrounded would wait forever. The
 * timer is therefore the guarantee, and the frame callback only sharpens the
 * timing while the tab is actually visible — whichever arrives first wins.
 */
export function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    requestAnimationFrame(finish);
    setTimeout(finish, 16);
  });
}
