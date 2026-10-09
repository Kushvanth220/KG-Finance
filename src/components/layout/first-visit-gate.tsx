"use client";


/**
 * Nothing to gate any more.
 *
 * Opening the app used to bounce a first-time visitor to /intro. The people
 * who use this are the two who built it — they are never first-time visitors,
 * and the redirect only ever cost them a screen on a fresh browser. The front
 * door still exists at /intro for anyone being shown the project; it is just
 * no longer in the way of the app.
 */

export const INTRO_SEEN_KEY = "kg-intro-seen";

export function FirstVisitGate() {
  return null;
}
