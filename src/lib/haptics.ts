/**
 * A tick you can feel when money is recorded.
 *
 * Android phones buzz; iPhones ignore `vibrate` entirely, and that is fine —
 * the visual confirmation is the real one, this is just a nicer key press.
 */
export function haptic(pattern: number | number[] = 12): void {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(pattern);
    }
  } catch {
    // Some embedded browsers throw on vibrate; silence is the correct fallback.
  }
}
