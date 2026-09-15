/**
 * Display names, in one place.
 *
 * The two people in a workspace are stored under short, stable ids (see
 * `Person` in `@/types`); these labels are what appears on screen and what the
 * assistant says out loud. Change the label, and every page, message and
 * prompt follows — stored records are never rewritten for a display choice.
 */

export const OWNER_LABEL: string = "Kushvanth";

export const MEMBER_LABEL: string = "G";

/**
 * Show the two names under the KG mark, in the header and the splash.
 *
 * Off: the brand stands on its own. The names still appear wherever they carry
 * meaning — whose account, whose expense, who is speaking — this only removes
 * them as decoration beneath the logo.
 */
export const SHOW_NAMES: boolean = false;

/** "Kushvanth & G" — used in headers, titles and the assistant's own blurb. */
export const MEMBERS_LABEL = `${OWNER_LABEL} & ${MEMBER_LABEL}`;
