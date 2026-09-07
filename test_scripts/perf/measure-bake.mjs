/** Ordinary and fully revealed map preparation gates; production preview compatible. */
await import('./performance-acceptance.mjs');
if (!process.exitCode) await import('./performance-map-stress.mjs');
