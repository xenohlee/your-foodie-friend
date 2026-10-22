import { z } from "zod";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code = "request_failed"
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const securityHeaders = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
};

export function json(
  data: unknown,
  status = 200,
  extraHeaders?: HeadersInit
): Response {
  const headers = new Headers(securityHeaders);
  new Headers(extraHeaders).forEach((value, key) => headers.set(key, value));
  return new Response(JSON.stringify(data), { status, headers });
}

export async function readJson<T>(
  request: Request,
  schema: z.ZodType<T>,
  maxBytes = 32_768
): Promise<T> {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > maxBytes)
    throw new ApiError(413, "Request body is too large.", "body_too_large");
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes)
    throw new ApiError(413, "Request body is too large.", "body_too_large");
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new ApiError(400, "Request body must be valid JSON.", "invalid_json");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    throw new ApiError(
      400,
      "Please check the submitted fields and try again.",
      "invalid_input"
    );
  return parsed.data;
}

export function assertOrigin(
  request: Request,
  variable: "ADMIN_ORIGIN" | "STOREFRONT_ORIGIN"
): void {
  const configured = process.env[variable];
  if (!configured)
    throw new ApiError(
      503,
      "This site is not fully configured yet.",
      "origin_not_configured"
    );
  let expected: string;
  try {
    expected = new URL(configured).origin;
  } catch {
    throw new ApiError(
      503,
      "The allowed site origin is invalid.",
      "origin_invalid"
    );
  }
  const supplied = request.headers.get("origin");
  if (supplied) {
    if (supplied !== expected)
      throw new ApiError(
        403,
        "This request is not allowed from this site.",
        "origin_rejected"
      );
    return;
  }
  // Browsers often omit Origin on safe same-origin GET/HEAD requests (including
  // the admin session/dashboard reads). Mutations still require an exact Origin.
  if (request.method === "GET" || request.method === "HEAD") {
    const fetchSite = request.headers.get("sec-fetch-site");
    if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none")
      throw new ApiError(
        403,
        "This request is not allowed from this site.",
        "origin_rejected"
      );
    return;
  }
  throw new ApiError(
    403,
    "This request is not allowed from this site.",
    "origin_rejected"
  );
}

export function requestIp(request: Request): string {
  const trusted = request.headers.get("x-nf-client-connection-ip");
  if (trusted && trusted.length <= 64) return trusted;
  const forwarded = request.headers
    .get("x-forwarded-for")
    ?.split(",")[0]
    ?.trim();
  return forwarded && forwarded.length <= 64 ? forwarded : "unknown";
}

export function methodNotAllowed(): Response {
  return json({ error: "Method not allowed." }, 405, {
    Allow: "GET, POST, PUT, PATCH",
  });
}
