/**
 * Shared HTTP helpers for route handlers: typed errors, zod body parsing, and
 * a wrapper that converts thrown errors into JSON responses.
 *
 * All user-facing error strings are English here (developer/client-facing
 * API), while item prompts and digests are Bahasa Indonesia.
 */

import { NextResponse } from "next/server";

import { ZodError, type ZodType } from "zod";

/** An error with an HTTP status, safe to surface to the client. */
export class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

/** Wrap a route-handler body so every throw becomes a JSON error response. */
export async function handleRoute(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof HttpError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid request body", issues: error.issues },
        { status: 400 },
      );
    }
    console.error("[api] unhandled error:", error);
    return NextResponse.json(
      { error: "Kesalahan server internal" },
      { status: 500 },
    );
  }
}

/** Parse and validate a JSON request body with zod; 400 on any failure. */
export async function parseJson<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new HttpError(400, "Request body must be valid JSON");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new HttpError(
      400,
      `Invalid request body: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
    );
  }
  return parsed.data;
}
