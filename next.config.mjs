/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  allowedDevOrigins: process.env.DEV_ORIGIN ? [process.env.DEV_ORIGIN] : [],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
        port: '',
        pathname: '/**', // Allow all Cloudinary paths
        search: '',
      },
      // Wasabi S3-compatible storage endpoints
      {
        protocol: 'https',
        hostname: 's3.us-east-1.wasabisys.com',
        port: '',
        pathname: '/**',
        search: '',
      },
      {
        protocol: 'https',
        hostname: 's3.us-east-2.wasabisys.com',
        port: '',
        pathname: '/**',
        search: '',
      },
      {
        protocol: 'https',
        hostname: 's3.us-west-1.wasabisys.com',
        port: '',
        pathname: '/**',
        search: '',
      },
      {
        protocol: 'https',
        hostname: 's3.eu-central-1.wasabisys.com',
        port: '',
        pathname: '/**',
        search: '',
      },
      {
        protocol: 'https',
        hostname: 's3.ap-northeast-1.wasabisys.com',
        port: '',
        pathname: '/**',
        search: '',
      },
      {
        protocol: 'https',
        hostname: 's3.ap-southeast-1.wasabisys.com',
        port: '',
        pathname: '/**',
        search: '',
      },
      // Standard AWS S3 endpoints (if someone wants to use AWS S3 instead of Wasabi)
      {
        protocol: 'https',
        hostname: '*.s3.amazonaws.com',
        port: '',
        pathname: '/**',
        search: '',
      },
      {
        protocol: 'https',
        hostname: '*.s3.*.amazonaws.com',
        port: '',
        pathname: '/**',
        search: '',
      },
    ],
    // Next.js Image optimization settings
    formats: ['image/webp', 'image/avif'], // Modern formats for better compression
    minimumCacheTTL: 86400, // Cache images for 24 hours
    dangerouslyAllowSVG: false, // Security: don't allow SVG
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    // Enable responsive images
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? { exclude: ['error', 'warn'] } : false,
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https://res.cloudinary.com https://*.amazonaws.com https://*.wasabisys.com",
              "media-src 'self' blob: https://res.cloudinary.com https://*.amazonaws.com https://*.wasabisys.com",
              "font-src 'self' https://fonts.gstatic.com",
              "connect-src 'self' https://res.cloudinary.com https://*.amazonaws.com https://*.wasabisys.com",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join('; '),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
