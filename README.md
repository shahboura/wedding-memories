# Wedding Memories Gallery

A modern, accessible wedding memories gallery supporting **both photos and videos** with local-only storage. Built with Next.js and optimized for self-hosted Docker deployments with full keyboard navigation and accessibility.

🌐 **[Live Demo](https://wedding.onurgumus.com)** | 🚀 **v0.1.0-beta.1**

> 🎯 **Beta**: Enhanced video support, improved code quality, and open source preparation.

## ✨ Features

- **Photo & Video Support** - unified handling for images and videos with direct HTML5 playback
- **Unified Upload Architecture** - single endpoint handling all media with smart storage routing
- **Responsive masonry gallery** with 1-4 columns based on screen size
- **Modal viewing** with cached data, keyboard/swipe navigation, and pinch-to-zoom
- **Multiple file upload** with drag & drop, batch selection, and progress tracking
- **Real-time gallery updates** automatically refresh after uploads
- **Guest welcome system** with name collection and persistent storage
- **Local storage backend** - filesystem storage optimized for self-hosted deployments
- **Docker support** - production and dev Docker Compose with zero-config local storage
- **Multi-language support** - English and Malay with runtime switching
- **Guest isolation mode** - filter media by guest when enabled in config
- **Advanced validation** with real-time feedback and security-focused rules
- **Mobile-optimized UX** with touch gestures and responsive design
- **Full accessibility** (WCAG 2.1 AA, ARIA labels, screen readers)
- **Dark/light theme** support with system preference detection
- **Transparent loading screens** that show content behind blur
- **TypeScript strict mode** with comprehensive type safety

## 🛠️ Tech Stack

- **Framework**: Next.js (latest) with App Router & TypeScript
- **Styling**: Tailwind CSS v4 + shadcn/ui components
- **Media Storage**: Local filesystem (self-hosted)
- **Video Handling**: Direct HTML5 playback
- **State Management**: Zustand with localStorage persistence
- **UI Components**: Vaul drawers, Framer Motion animations
- **Icons**: Lucide React icon library
- **Theme**: next-themes for dark/light mode support
- **Validation**: Security-focused with comprehensive input sanitization
- **Accessibility**: WCAG 2.1 AA compliant

## 🚀 Quick Start

1. **Clone and install**

   ```bash
   git clone <repository-url>
   cd wedding-memories
   pnpm install
   ```

2. **Configure environment**

   ```bash
   cp .env.example .env
    # Edit .env — set couple names and preferences
   ```

3. **Start development**

   ```bash
   pnpm dev
   # Open http://localhost:3010
   ```

### Configuration Files

**Environment Variables (.env)**

**Event Token (Optional)**

- Set `EVENT_TOKEN` to gate access to the gallery and uploads.
- Guests can join via QR link that sets a secure cookie and redirects to the gallery:

```
https://your-domain.com/event?token=YOUR_EVENT_TOKEN
```

**App Configuration (config.ts)**

```typescript
export const appConfig = {
  brideName: 'YourBrideName', // or set NEXT_PUBLIC_BRIDE_NAME env var
  groomName: 'YourGroomName', // or set NEXT_PUBLIC_GROOM_NAME env var
  guestIsolation: false, // or set NEXT_PUBLIC_GUEST_ISOLATION env var
  storage: StorageProvider.Local,
};
```

**Storage**

- **Local filesystem**: Filesystem storage with no cloud dependencies — ideal for Docker / self-hosted deployments
- **Media variants**: Server generates thumbnail and medium WebP variants for images

**Guest Isolation Mode**

- **`false`** (default) — Shared gallery: everyone sees all photos from all guests, like a communal photo album
- **`true`** — Private gallery: each guest only sees their own uploads, like individual photo booths
- File storage is identical either way — uploads are always organized into per-guest folders. The setting only controls **which photos are visible** to each guest, not how they are stored
- Server-side rendering shows empty gallery when isolation is enabled; client-side fetches the guest's photos after name entry

## 📁 Project Structure

```
├── app/                    # Next.js App Router
│   ├── api/               # API routes
│   │   ├── photos/        # Photo listing endpoint
│   │   ├── upload/        # Unified media upload endpoint
│   │   └── media/         # Local file serving (path-protected)
│   ├── page.tsx           # Main gallery page with server components
│   └── loading.tsx        # Global transparent loading UI
├── components/            # React components
│   ├── ui/               # shadcn/ui components (Button, Drawer, etc.)
│   ├── MediaGallery.tsx  # Masonry grid with modal integration for photos/videos
│   ├── StorageAwareMedia.tsx # Local media rendering with HTML5 video
│   ├── MediaModal.tsx    # Modal with pinch-to-zoom and gesture support
│   ├── Upload.tsx        # Unified media upload
│   ├── AppLoader.tsx     # Startup loader with couple names
│   └── GuestNameForm.tsx # Guest name collection
├── store/                # Zustand state management
│   └── useAppStore.ts    # Global state store
├── storage/              # Storage abstraction layer
│   ├── StorageService.ts # Storage interface definition
│   ├── LocalStorageService.ts # Local filesystem implementation
│   └── index.ts          # Storage export
├── locales/              # i18n translation files
│   ├── en/               # English
│   └── ms/               # Malay (Melayu)
├── utils/                # Utilities and helpers
│   ├── types.ts          # TypeScript interfaces for media data
│   ├── validation.ts     # Input validation utilities with security focus
│   ├── imageUrl.ts       # Media URL passthrough
│   ├── mediaOptimization.ts  # Local image variant URLs
│   └── testing.ts        # Test utilities and mocks
├── Dockerfile            # Multi-stage Docker build (deps → build → runner)
├── docker-compose.yml    # Production Docker Compose
├── docker-compose.dev.yml # Development override (hot-reload)
├── .env.docker.example   # Documented Docker env template
├── config.ts             # App configuration (couple names, features)
```

## 📝 Development

```bash
pnpm dev         # Start development server (http://localhost:3010)
pnpm build       # Build for production
pnpm start       # Start production server
pnpm lint        # Run ESLint code linting
pnpm format      # Format code with Prettier
pnpm type-check  # Run TypeScript type checking
```

## 🚀 Deployment

Deploy to [Vercel](https://vercel.com/new/clone) (recommended), Docker, or any platform supporting Next.js:

1. **Vercel (Recommended)**
   - Connect your GitHub repository
   - Configure environment variables in dashboard
   - Automatic deployments on push to main

2. **Docker (Self-Hosted)**

   ```bash
   # Copy and customise the env file
   cp .env.docker.example .env

   # Production
   docker compose up -d --build

   # Development (hot-reload)
   docker compose -f docker-compose.yml -f docker-compose.dev.yml up
   ```

   - Uses local filesystem storage — no cloud credentials needed
   - Uploaded media persists in a Docker named volume (`wedding-uploads`)
   - Set `NEXT_PUBLIC_BRIDE_NAME`, `NEXT_PUBLIC_GROOM_NAME`, `NEXT_PUBLIC_DEFAULT_LANGUAGE`, etc. in `.env`
   - See `.env.docker.example` for all available options

3. **Other Platforms**
   - Ensure Node.js 18+ support
   - Configure all environment variables
   - Set build command: `pnpm build`
   - Set output directory: `.next`

## 🔍 Code Quality & Features

- **TypeScript strict mode** with comprehensive type safety
- **WCAG 2.1 AA accessibility** compliance throughout
- **Security-first validation** with input sanitization and file type checking
- **Advanced name validation** with real-time feedback, length limits, and character restrictions
- **Guest isolation system** with server-side and client-side filtering
- **Mobile-optimized UX** with improved touch targets and responsive dialogs
- **Performance optimizations** with local image variants and caching
- **Progressive enhancement** with graceful fallbacks for all features
- **Real-time state management** with Zustand and localStorage persistence
- **Mobile-first responsive design** with Tailwind CSS utilities
- **Stable React components** preventing unnecessary re-renders and animations

## 🤝 Contributing

1. Fork the repository and create your branch from `main`
2. Follow coding standards defined in [CONTRIBUTING.md](./CONTRIBUTING.md)
3. Ensure TypeScript strict mode compliance and accessibility standards
4. Test your changes thoroughly, especially upload functionality
5. Run quality checks: `pnpm lint`, `pnpm type-check`, and `pnpm build`
6. Submit a Pull Request with clear description of changes

See [CONTRIBUTING.md](./CONTRIBUTING.md) for detailed guidelines.

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgements

This project was bootstrapped with the
[Next.js Image Gallery Starter](https://vercel.com/templates/next.js/image-gallery-starter) by Vercel.

---

Built with ❤️ using [Next.js](https://nextjs.org), [shadcn/ui](https://ui.shadcn.com), and [Tailwind CSS](https://tailwindcss.com).
