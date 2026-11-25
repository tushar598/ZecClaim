import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { DatabaseUnavailableError } from "@/lib/db/mongodb";

/**
 * Turns a thrown value into a short, user-readable message.
 * ZodError.message is a JSON dump of every issue; surface "field: message" instead.
 * Never include request bodies here: they can contain addresses or claim tokens.
 */
export function describeError(err: unknown, fallback: string): string {
  if (err instanceof ZodError) {
    return err.issues
      .map((issue) => (issue.path.length > 0 ? `${issue.path.join(".")}: ${issue.message}` : issue.message))
      .join("; ");
  }
  if (err instanceof SyntaxError) {
    return "Request body is not valid JSON.";
  }
  return err instanceof Error ? err.message : fallback;
}

/**
 * JSON error response for a route's catch block: 503 when the database is down (fail closed),
 * otherwise `status` (400 for bad input by default).
 */
export function errorResponse(err: unknown, fallback: string, status = 400): NextResponse {
  if (err instanceof DatabaseUnavailableError) {
    return NextResponse.json({ success: false, error: err.message }, { status: 503 });
  }
  return NextResponse.json({ success: false, error: describeError(err, fallback) }, { status });
}
