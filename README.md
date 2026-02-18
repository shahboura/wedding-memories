# Wedding Memories

Self-hosted photo & video gallery for weddings. Guests upload via QR code, everyone sees the shared album in real time.

Built with Next.js, Tailwind CSS v4, and Zustand. Runs in Docker with zero cloud dependencies.

## Why

Wedding photo apps are either expensive SaaS or privacy nightmares. This is a single Docker container on your own hardware. Guests scan a QR code, upload photos/videos, and browse the shared gallery — no accounts, no cloud, no subscriptions.

## Performance

Optimized for mobile wedding guests on cellular data:

- **Images**: Sharp generates WebP thumbnails (400px) and medium variants (1080px) at upload time. Gallery serves medium; full-res only in modal.
- **Video**: Starts at `preload="none"`, upgrades to metadata via IntersectionObserver at 200px, extracts first frame client-side. HTTP Range requests enable seeking without full download.
- **Blur placeholders**: Generated at upload, piped end-to-end to `<Image placeholder="blur">` — zero layout shift.
- **Code splitting**: Modal (700 lines + Framer Motion) and Upload components are `dynamic()` imports, SSR-disabled.
- **Streaming**: Media files are streamed via `ReadableStream`, never buffered into memory. 24h immutable cache headers.
- **State**: Zustand with per-field selector hooks — components re-render only when their slice changes.

Designed for 50–200 media items. No pagination, no video transcoding — intentional simplicity for the expected scale.

## Quick Start

```bash
# Clone and configure
git clone <repository-url>
cd wedding-memories
cp .env.docker.example .env
# Edit .env — set couple names, EVENT_TOKEN, language

# Run
docker compose up -d --build
```

Guests join via QR link: `https://your-domain.com/event?token=YOUR_EVENT_TOKEN`

### Development

```bash
pnpm install
pnpm dev                    # http://localhost:3010
pnpm lint                   # ESLint
pnpm type-check             # TypeScript strict mode
docker compose -f docker-compose.yml -f docker-compose.dev.yml up  # Docker dev
```

## Configuration

| Variable                       | Description                          | Default |
| ------------------------------ | ------------------------------------ | ------- |
| `NEXT_PUBLIC_BRIDE_NAME`       | Bride's name                         | —       |
| `NEXT_PUBLIC_GROOM_NAME`       | Groom's name                         | —       |
| `EVENT_TOKEN`                  | Access token for QR gate             | —       |
| `NEXT_PUBLIC_DEFAULT_LANGUAGE` | `en` or `ms`                         | `en`    |
| `NEXT_PUBLIC_GUEST_ISOLATION`  | `true` = guests see only own uploads | `false` |

See `.env.docker.example` for all options.

## Stack

Next.js (App Router) · TypeScript strict · Tailwind CSS v4 · Zustand · Framer Motion · Sharp · Radix UI · Docker multi-stage build

## Agentic Development

This project is developed with AI-assisted workflows using [agents-opencode](https://github.com/shahboura/agents-opencode) — a collection of specialized agents for code review, documentation, and orchestrated multi-phase development.

## License

MIT
