// The Studio's sign-in page is this app, served at /sign-in/ (netlify.toml). There it signs in and
// sends the visit on: to ?next=, or to the dashboard. The comp report's own address sends a
// signed-out visit there instead of showing the sign-in itself.
export const STUDIO_SIGN_IN_PATH = '/sign-in/';

export const STUDIO_SIGN_IN = typeof location !== 'undefined' && /^\/sign-in(\/|$)/.test(location.pathname);

/** The sign-in page, coming back to this page of the comp report after. */
export function studioSignInUrl(): string {
  return `${STUDIO_SIGN_IN_PATH}?next=${encodeURIComponent(location.pathname + location.search)}`;
}
