/**
 * Shared device detection utilities.
 *
 * Uses a module-level cache so the userAgent regex runs at most once per page load.
 * Safe to call during SSR (returns conservative defaults).
 */

let _cachedIsMobile: boolean | null = null;

export function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false;
  if (_cachedIsMobile === null) {
    _cachedIsMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    );
  }
  return _cachedIsMobile;
}
