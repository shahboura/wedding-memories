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
 * Resolves the storage provider from the NEXT_PUBLIC_STORAGE_PROVIDER env var,
 * falling back to the hardcoded default.
 *
 * NEXT_PUBLIC_* env vars are inlined into both server and client bundles at
 * build time by Next.js, so they work identically in SSR and hydration.
 */
function resolveStorageProvider(): StorageProvider {
  const envValue = process.env.NEXT_PUBLIC_STORAGE_PROVIDER?.toLowerCase();
  if (envValue === 'local') return StorageProvider.Local;
  if (envValue === 's3') return StorageProvider.S3;
  if (envValue === 'cloudinary') return StorageProvider.Cloudinary;
  return StorageProvider.Cloudinary; // default
}

export const appConfig = {
  brideName: process.env.NEXT_PUBLIC_BRIDE_NAME || 'Bride',
  groomName: process.env.NEXT_PUBLIC_GROOM_NAME || 'Groom',
  guestIsolation: process.env.NEXT_PUBLIC_GUEST_ISOLATION !== 'false',
  storage: resolveStorageProvider(),
  defaultLanguage: (process.env.NEXT_PUBLIC_DEFAULT_LANGUAGE as Language) || Language.English,
  supportedLanguages: [Language.English, Language.Malay],
  whatsappNumber: process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || '',
};
