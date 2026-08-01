const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

/**
 * Prefixes a root-relative application path with Astro's configured base path.
 *
 * @param   path   Root-relative application path.
 *
 * @returns        Path suitable for the current deployment target.
 */
const withBasePath = (path: string): string => `${basePath}${path}`;

export { withBasePath };
