import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

/**
 * Unauthenticated health check endpoint for container orchestration
 * (Docker HEALTHCHECK, Kubernetes liveness/readiness probes, load balancers).
 *
 * Returns 200 with a JSON body containing the service status and uptime.
 * No event token required — this endpoint is intentionally public.
 */
export function GET(): NextResponse {
  return NextResponse.json(
    {
      status: 'ok',
      uptime: process.uptime(),
    },
    { status: 200 }
  );
}
