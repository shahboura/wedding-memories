export enum StorageProvider {
  Local = 'local',
}

export enum Language {
  English = 'en',
  Malay = 'ms',
}

export const appConfig = {
  brideName: process.env.NEXT_PUBLIC_BRIDE_NAME || 'Bride',
  groomName: process.env.NEXT_PUBLIC_GROOM_NAME || 'Groom',
  guestIsolation: process.env.NEXT_PUBLIC_GUEST_ISOLATION === 'true',
  storage: StorageProvider.Local,
  defaultLanguage: (process.env.NEXT_PUBLIC_DEFAULT_LANGUAGE as Language) || Language.English,
  supportedLanguages: [Language.English, Language.Malay],
  whatsappNumber: process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || '',
};
