/**
 * Route entry point for `/champions` and `/champions/:championKey`.
 *
 * The screen itself lives in `views/builds/`, split into focused components;
 * this file only keeps the default export the router lazily imports.
 */
export { default } from "./builds/ChampionsView";
