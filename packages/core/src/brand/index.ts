/**
 * The brand shapes and the card renderer, with no server dependencies.
 *
 * This subpath exists so the browser can import the same field definitions
 * the server validates against (`@dpost/core/brand`) without dragging in the
 * database, Redis and the mailer through the main entry point.
 */
export * from './sections';
export * from './card';
