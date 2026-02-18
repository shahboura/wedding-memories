export enum Language {
  English = 'en',
  Malay = 'ms',
}

export const appConfig = {
  brideName: process.env.NEXT_PUBLIC_BRIDE_NAME || 'Bride',
  groomName: process.env.NEXT_PUBLIC_GROOM_NAME || 'Groom',
  guestIsolation: process.env.NEXT_PUBLIC_GUEST_ISOLATION === 'true',
  defaultLanguage: (process.env.NEXT_PUBLIC_DEFAULT_LANGUAGE as Language) || Language.English,
  supportedLanguages: [Language.English, Language.Malay],
  whatsappNumber: process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || '',
};
