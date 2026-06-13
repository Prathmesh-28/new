// Type declaration for the vanilla-JS animation module (allowJs is off, so the
// .tsx import resolves against this; Vite bundles the actual hero3d.js).

/** Initialise the decorative 3D/WebGL hero background layers.
 *  Returns a cleanup function that removes every layer and stops all loops. */
export function initHero3D(): () => void;
