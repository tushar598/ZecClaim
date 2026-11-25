/**
 * Theme bootstrap shared by the server layout and the client ThemeToggle.
 * Kept out of the "use client" module so the server layout receives a real string.
 */
export const THEME_STORAGE_KEY = "zecclaim_theme";

/**
 * Runs before first paint (inlined in <head>) so a saved dark preference never flashes light.
 * Light is the default, matching the reference UI. A `?theme=dark|light` query parameter
 * overrides and persists the choice (useful for sharing a link in a specific theme).
 */
export const THEME_INIT_SCRIPT = `(function(){var d=document.documentElement;try{var q=new URLSearchParams(location.search).get("theme");if(q==="dark"||q==="light"){localStorage.setItem("${THEME_STORAGE_KEY}",q);}var t=localStorage.getItem("${THEME_STORAGE_KEY}");d.setAttribute("data-theme",t==="dark"?"dark":"light");}catch(e){d.setAttribute("data-theme","light");}})();`;
