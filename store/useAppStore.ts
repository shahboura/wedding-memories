import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { MediaProps } from '../utils/types';

interface AppState {
  guestName: string;
  setGuestName: (name: string) => void;

  media: MediaProps[];
  setMedia: (media: MediaProps[]) => void;

  isMediaModalOpen: boolean;
  selectedMediaId: number | null;
  openMediaModal: (id: number) => void;
  closeMediaModal: () => void;

  refreshCounter: number;
  isLoadingMedia: boolean;
  setIsLoadingMedia: (loading: boolean) => void;
  refreshMedia: () => void;

  _hasHydrated: boolean;
}

const useAppStore = create<AppState>()(
  persist(
    (set, _get) => ({
      guestName: '',
      setGuestName: (name: string) => set({ guestName: name }),

      media: [],
      setMedia: (media: MediaProps[]) => set({ media }),

      isMediaModalOpen: false,
      selectedMediaId: null,
      openMediaModal: (id: number) =>
        set({
          isMediaModalOpen: true,
          selectedMediaId: id,
        }),
      closeMediaModal: () =>
        set({
          isMediaModalOpen: false,
          selectedMediaId: null,
        }),

      refreshCounter: 0,
      isLoadingMedia: false,
      setIsLoadingMedia: (loading: boolean) => set({ isLoadingMedia: loading }),
      refreshMedia: () => set((state) => ({ refreshCounter: state.refreshCounter + 1 })),

      _hasHydrated: false,
    }),
    {
      name: 'wedding-memories-store',
      partialize: (state) => ({
        guestName: state.guestName,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state._hasHydrated = true;
        }
      },
    }
  )
);
export const useGuestName = () => useAppStore((state) => state.guestName);
export const useSetGuestName = () => useAppStore((state) => state.setGuestName);

export const useMedia = () => useAppStore((state) => state.media);
export const useSetMedia = () => useAppStore((state) => state.setMedia);

export const useMediaModalOpen = () => useAppStore((state) => state.isMediaModalOpen);
export const useSelectedMediaId = () => useAppStore((state) => state.selectedMediaId);
export const useOpenMediaModal = () => useAppStore((state) => state.openMediaModal);
export const useCloseMediaModal = () => useAppStore((state) => state.closeMediaModal);

export const useIsLoadingMedia = () => useAppStore((state) => state.isLoadingMedia);
export const useRefreshCounter = () => useAppStore((state) => state.refreshCounter);
export const useSetIsLoadingMedia = () => useAppStore((state) => state.setIsLoadingMedia);
export const useRefreshMedia = () => useAppStore((state) => state.refreshMedia);
export const useHasHydrated = () => useAppStore((state) => state._hasHydrated);
