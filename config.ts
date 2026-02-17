export enum StorageProvider {
  Cloudinary = 'cloudinary',
  S3 = 's3',
  Local = 'local',
}

export enum Language {
  English = 'en',
  Turkish = 'tr',
  Malay = 'ms',
}

/**
 * Resolves the storage provider from the STORAGE_PROVIDER env var,
 * falling back to the hardcoded default.
 *
 * These env vars are baked into the bundle at build time via Dockerfile.
 */
function resolveStorageProvider(): StorageProvider {
  const envValue = process.env.STORAGE_PROVIDER?.toLowerCase();
  if (envValue === 'local') return StorageProvider.Local;
  if (envValue === 's3') return StorageProvider.S3;
  if (envValue === 'cloudinary') return StorageProvider.Cloudinary;
  return StorageProvider.Cloudinary; // default
}

export const appConfig = {
  brideName: process.env.BRIDE_NAME || 'Bride',
  groomName: process.env.GROOM_NAME || 'Groom',
  guestIsolation: process.env.GUEST_ISOLATION !== 'false',
  storage: resolveStorageProvider(),
  defaultLanguage: (process.env.DEFAULT_LANGUAGE as Language) || Language.English,
  supportedLanguages: [Language.English, Language.Malay],
  whatsappNumber: process.env.WHATSAPP_NUMBER || '',
};
