const GITHUB_HOSTNAME = 'github.com';
const RAW_GITHUB_HOSTNAME = 'raw.githubusercontent.com';
const SUPPORTED_PROTOCOLS = new Set(['http:', 'https:']);

export function isSupportedMarkdownUrlProtocol(protocol: string): boolean {
  return SUPPORTED_PROTOCOLS.has(protocol);
}

export function normalizeGitHubBlobUrl(input: string | URL): string | null {
  const url = typeof input === 'string' ? new URL(input) : new URL(input.toString());

  url.search = '';
  url.hash = '';

  if (url.hostname.toLowerCase() !== GITHUB_HOSTNAME) {
    return null;
  }

  const pathSegments = url.pathname.split('/').filter(Boolean);

  if (pathSegments.length < 5 || pathSegments[2] !== 'blob') {
    return null;
  }

  const [owner, repository, , ref, ...path] = pathSegments;

  if (!owner || !repository || !ref || path.length === 0) {
    return null;
  }

  return new URL(
    `/${owner}/${repository}/${ref}/${path.join('/')}`,
    `https://${RAW_GITHUB_HOSTNAME}`,
  ).toString();
}

export function normalizeMarkdownSourceUrl(input: string): string {
  const url = new URL(input);

  if (!isSupportedMarkdownUrlProtocol(url.protocol)) {
    throw new Error(`Unsupported URL scheme: ${url.protocol}`);
  }

  url.search = '';
  url.hash = '';

  return normalizeGitHubBlobUrl(url) ?? url.toString();
}
