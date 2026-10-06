import { timingSafeEqual } from "node:crypto";

/**
 * Shared secret for the scheduled jobs.
 *
 * These endpoints credit payments and send mail, so they must not be callable
 * by anyone who finds the URL. A header check is enough: the caller is a cron
 * runner, not a person, so there is no session to reason about.
 *
 * If CRON_SECRET is unset the job REFUSES rather than running open. An
 * unprotected endpoint that credits subscriptions is worse than one that does
 * not run — a missed cycle is caught by the next one.
 */
export function isAuthorisedJob(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;

  const header = request.headers.get("authorization") ?? "";
  const presented = header.toLowerCase().startsWith("bearer ")
    ? header.slice(7).trim()
    : (request.headers.get("x-cron-secret") ?? "").trim();

  if (presented.length !== expected.length) return false;

  // Constant-time: a plain === leaks the secret one character at a time to
  // anyone who can measure the response.
  return timingSafeEqual(Buffer.from(presented), Buffer.from(expected));
}
