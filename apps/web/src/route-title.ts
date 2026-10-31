const SITE_NAME = 'DeadSpace';

/** Route `handle` shape: pages declare their title in the router config. */
export interface RouteHandle {
  title?: string;
}

/** Document title for the deepest matched route that declares one. */
export function routeTitle(matches: readonly { handle?: unknown }[]): string {
  for (const match of [...matches].reverse()) {
    const title = (match.handle as RouteHandle | undefined)?.title;
    if (title) return `${title} · ${SITE_NAME}`;
  }
  return SITE_NAME;
}
