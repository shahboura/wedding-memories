#!/usr/bin/env node

/**
 * Environment validation stub.
 *
 * Local-only storage requires no cloud credentials, so validation is a no-op.
 * Kept as a script entry point for the `validate-env` npm script.
 */

if (require.main === module) {
  if (process.env.SKIP_ENV_VALIDATION === '1' || process.env.SKIP_ENV_VALIDATION === 'true') {
    console.log('Skipping environment validation (SKIP_ENV_VALIDATION is set)');
    process.exit(0);
  }

  const storagePath = process.env.LOCAL_STORAGE_PATH || '/app/uploads';
  console.log(`Environment OK — local storage (${storagePath})`);
}
