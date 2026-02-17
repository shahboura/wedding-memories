#!/usr/bin/env node

/**
 * Environment validation script for build-time checks.
 * Prevents deployment with missing or invalid environment variables.
 *
 * Usage:
 *   npm run validate-env
 *   node scripts/validate-env.js
 */

// Load environment variables from .env file
try {
  require('dotenv').config();
} catch {
  // dotenv might not be available in production, that's fine
  console.log('Note: dotenv not available, using system environment variables');
}

// Since we can't easily require TypeScript files in Node.js, let's inline the validation logic
// Required environment variables
const CLOUDINARY_VARS = [
  'NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
  'CLOUDINARY_FOLDER',
];

const S3_VARS = [
  'AWS_REGION',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'NEXT_PUBLIC_S3_BUCKET',
  'NEXT_PUBLIC_S3_ENDPOINT',
];

function isValidValue(value) {
  if (!value || value.trim() === '') {
    return false;
  }

  const placeholders = [
    'your_cloud_name_here',
    'your_api_key_here',
    'your_api_secret_here',
    'your_wasabi_access_key_here',
    'your_wasabi_secret_key_here',
    'your-wedding-bucket-name',
    'your-bucket-here',
    'example.com',
    'localhost',
    'test',
    'placeholder',
  ];

  const lowerValue = value.toLowerCase();
  return !placeholders.some((placeholder) => lowerValue.includes(placeholder));
}

function validateEnvironment() {
  // Determine storage provider from env var first, then config.ts
  let storageProvider = (process.env.NEXT_PUBLIC_STORAGE_PROVIDER || '').toLowerCase();

  if (!storageProvider) {
    try {
      const fs = require('fs');
      const configContent = fs.readFileSync('config.ts', 'utf8');
      if (configContent.includes('StorageProvider.S3')) {
        storageProvider = 's3';
      } else if (configContent.includes('StorageProvider.Local')) {
        storageProvider = 'local';
      } else {
        storageProvider = 'cloudinary';
      }
    } catch {
      storageProvider = 'cloudinary';
    }
  }

  // Local storage requires no cloud credentials
  if (storageProvider === 'local') {
    return {
      valid: true,
      storageProvider,
      missing: [],
      invalid: [],
    };
  }

  const missing = [];
  const invalid = [];

  // Check storage-specific variables
  const storageVars = storageProvider === 'cloudinary' ? CLOUDINARY_VARS : S3_VARS;
  storageVars.forEach((varName) => {
    const value = process.env[varName];
    if (!value) {
      missing.push(varName);
    } else if (!isValidValue(value)) {
      invalid.push(varName);
    }
  });

  return {
    valid: missing.length === 0 && invalid.length === 0,
    storageProvider,
    missing,
    invalid,
  };
}

// ANSI color codes for terminal output
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
};

function log(message, color = colors.white) {
  console.log(`${color}${message}${colors.reset}`);
}

function logError(message) {
  log(`❌ ${message}`, colors.red);
}

function logSuccess(message) {
  log(`✅ ${message}`, colors.green);
}

function logInfo(message) {
  log(`ℹ️  ${message}`, colors.cyan);
}

function main() {
  try {
    log(`${colors.bold}Wedding Memories - Environment Validation${colors.reset}`);
    log(`${colors.dim}${'='.repeat(50)}${colors.reset}`);

    // Perform validation
    const result = validateEnvironment();

    // Show current configuration
    logInfo(`Storage Provider: ${result.storageProvider}`);

    log(''); // Empty line

    // Show required environment variables
    if (result.storageProvider === 'local') {
      logSuccess('Local storage mode - no cloud credentials required.');
      logInfo(`Storage path: ${process.env.LOCAL_STORAGE_PATH || '/app/uploads'}`);
    } else {
      const allVars = [...(result.storageProvider === 'cloudinary' ? CLOUDINARY_VARS : S3_VARS)];

      log(`${colors.bold}Environment Variables Check:${colors.reset}`);
      allVars.forEach((varName) => {
        const value = process.env[varName];
        const isValid = value && isValidValue(value);
        const status = isValid ? '\u2713' : '\u2717';
        const statusColor = isValid ? colors.green : colors.red;
        log(`  ${statusColor}${status}${colors.reset} ${varName}`);
      });
    }

    log(''); // Empty line
    log(`${colors.bold}Validation Results:${colors.reset}`);

    if (result.valid) {
      logSuccess(`Environment is ready for deployment with ${result.storageProvider} storage!`);
      logSuccess('All required environment variables are present and valid.');
      process.exit(0);
    } else {
      logError(`Environment validation failed for ${result.storageProvider} storage`);

      if (result.missing.length > 0) {
        log(''); // Empty line
        logError('Missing Environment Variables:');
        result.missing.forEach((varName) => {
          log(`  • ${varName}`, colors.red);
        });
      }

      if (result.invalid.length > 0) {
        log(''); // Empty line
        logError('Invalid/Placeholder Environment Variables:');
        result.invalid.forEach((varName) => {
          log(`  • ${varName}`, colors.red);
        });
      }

      log(''); // Empty line
      log(`${colors.bold}How to fix:${colors.reset}`);
      log(`1. Set missing environment variables in your deployment platform`);
      log(`2. Replace placeholder values with actual credentials`);
      log(`3. For ${result.storageProvider} storage credentials:`);

      if (result.storageProvider === 'cloudinary') {
        log(`   - Get from: ${colors.cyan}https://cloudinary.com/console${colors.reset}`);
      } else {
        log(`   - Get from your S3/Wasabi console`);
      }

      log(`4. For local development: copy .env.example to .env and fill values`);

      log(''); // Empty line
      logError('🚫 DEPLOYMENT BLOCKED - Fix environment variables before deploying');

      process.exit(1);
    }
  } catch (error) {
    logError('Environment validation failed with error:');
    log(error.message, colors.red);

    log(''); // Empty line
    logError('🚫 DEPLOYMENT BLOCKED - Fix environment configuration');

    process.exit(1);
  }
}

// Run only if called directly (not imported)
if (require.main === module) {
  // Allow skipping validation during Docker builds (credentials aren't available yet)
  if (process.env.SKIP_ENV_VALIDATION === '1' || process.env.SKIP_ENV_VALIDATION === 'true') {
    console.log('⏭️  Skipping environment validation (SKIP_ENV_VALIDATION is set)');
    process.exit(0);
  }
  main();
}

module.exports = { main };
