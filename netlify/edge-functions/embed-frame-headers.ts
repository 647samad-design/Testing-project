// Lets partner websites show the ballot widget (/embed) in an iframe.
// Everything else on the site keeps X-Frame-Options: DENY (netlify.toml).
// deno-lint-ignore-file
type Context = { next: () => Promise<Response> };

export default async (request: Request, context: Context): Promise<Response> => {
  const path = new URL(request.url).pathname;
  const response = await context.next();
  if (!/^\/(?:[a-z]{2}\/)?embed\/?$/.test(path)) return response;
  const headers = new Headers(response.headers);
  headers.delete("x-frame-options");
  headers.set("content-security-policy", "frame-ancestors *");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
};
