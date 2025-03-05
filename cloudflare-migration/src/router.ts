export class Router {
  private routes: Map<RegExp, (request: Request) => Promise<Response>>;

  constructor() {
    this.routes = new Map();
  }

  handle(pattern: string, handler: (request: Request) => Promise<Response>): Router {
    this.routes.set(new RegExp(`^${pattern}$`), handler);
    return this;
  }

  async route(request: Request, env: any): Promise<Response> {
    const url = new URL(request.url);
    for (const [pattern, handler] of this.routes) {
      if (url.pathname.match(pattern)) {
        return handler(request);
      }
    }
    return new Response('Not Found', { status: 404 });
  }
}