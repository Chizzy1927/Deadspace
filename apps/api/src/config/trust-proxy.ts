import { BlockList, isIP } from 'node:net';

/** Express `trust proxy` value: a hop count, or a function of (address, position in the chain). */
export type TrustProxy = number | ((addr: string, i: number) => boolean);

export const TRUST_PROXY_PROFILES = ['render-cloudflare'] as const;
export type TrustProxyProfile = (typeof TRUST_PROXY_PROFILES)[number];

// Cloudflare proxy ranges. Source: https://www.cloudflare.com/ips-v4 and https://www.cloudflare.com/ips-v6,
// fetched 2026-11-01. Cloudflare changes these rarely: re-check both lists periodically (docs/DEPLOYMENT.md).
// An unlisted edge range degrades to a shared rate-limit bucket for those visitors; it never lets a forged
// header choose the key.
const CLOUDFLARE_CIDRS = [
  '173.245.48.0/20',
  '103.21.244.0/22',
  '103.22.200.0/22',
  '103.31.4.0/22',
  '141.101.64.0/18',
  '108.162.192.0/18',
  '190.93.240.0/20',
  '188.114.96.0/20',
  '197.234.240.0/22',
  '198.41.128.0/17',
  '162.158.0.0/15',
  '104.16.0.0/13',
  '104.24.0.0/14',
  '172.64.0.0/13',
  '131.0.72.0/22',
  '2400:cb00::/32',
  '2606:4700::/32',
  '2803:f800::/32',
  '2405:b500::/32',
  '2405:8100::/32',
  '2a06:98c0::/29',
  '2c0f:f248::/32',
];

function blockList(cidrs: readonly string[]): BlockList {
  const list = new BlockList();
  for (const cidr of cidrs) {
    const [net = '', prefix = ''] = cidr.split('/');
    list.addSubnet(net, Number(prefix), isIP(net) === 6 ? 'ipv6' : 'ipv4');
  }
  return list;
}

const loopback = blockList(['127.0.0.0/8', '::1/128']);
const renderInternal = blockList(['10.0.0.0/8']);
const cloudflare = blockList(CLOUDFLARE_CIDRS);

function inList(list: BlockList, addr: string): boolean {
  const family = isIP(addr);
  return family !== 0 && list.check(addr, family === 6 ? 'ipv6' : 'ipv4'); // IPv4-mapped IPv6 matches IPv4 rules
}

/**
 * Render Free chain, observed in production: socket (loopback) <- Render internal (10.x) <- Cloudflare <- client.
 * Trusts each position only for its expected address class and nothing past position 2, so Express's `req.ip` is
 * the first entry that does not fit: the client the Cloudflare hop recorded. Any other shape stops trust early
 * instead of advancing into client-supplied X-Forwarded-For entries.
 */
export function renderCloudflareTrust(addr: string, i: number): boolean {
  if (i === 0) return inList(loopback, addr);
  if (i === 1) return inList(renderInternal, addr);
  if (i === 2) return inList(cloudflare, addr);
  return false;
}

export function trustProxyForProfile(profile: TrustProxyProfile): TrustProxy {
  return profile === 'render-cloudflare' ? renderCloudflareTrust : 0;
}
