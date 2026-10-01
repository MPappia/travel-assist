// Garde-fous anti-SSRF pour les requêtes sortantes vers des URL saisies par l'utilisateur.
// - schémas http/https uniquement, pas d'identifiants dans l'URL, ports usuels ;
// - refus de localhost et de toute adresse privée, réservée, de lien local ou multicast ;
// - la vérification porte sur les adresses réellement résolues au moment de la connexion
//   (fonction `lookup` passée à node:http), ce qui couvre aussi le « DNS rebinding » et les redirections.
import { lookup as dnsLookup, type LookupAddress, type LookupOptions } from "node:dns";
import { BlockList, isIP } from "node:net";

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeUrlError";
  }
}

const ALLOWED_PORTS = new Set(["", "80", "443", "8080", "8443"]);

// Deux listes distinctes : une BlockList unique appliquerait la règle IPv6 « ::ffff:0:0/96 » aux adresses IPv4.
const ipv4BlockList = new BlockList();
const ipv6BlockList = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  ipv4BlockList.addSubnet(network, prefix, "ipv4");
}
for (const [network, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["::ffff:0:0", 96], // IPv4 mappées : jamais nécessaires pour un site public
  ["64:ff9b::", 96], // NAT64
  ["100::", 64],
  ["2001:db8::", 32],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  ipv6BlockList.addSubnet(network, prefix, "ipv6");
}

export function isPrivateAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return ipv4BlockList.check(address, "ipv4");
  if (version === 6) return ipv6BlockList.check(address, "ipv6");
  return true; // pas une IP valide : on refuse par prudence
}

function stripBrackets(hostname: string) {
  return hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
}

/**
 * Valide la forme d'une URL avant toute requête. Lève UnsafeUrlError si elle est refusée.
 * Les noms de domaine sont ensuite contrôlés à la résolution DNS (voir `safeLookup`).
 */
export function assertSafeUrl(raw: string, options: { allowPrivateNetwork?: boolean } = {}): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeUrlError("Adresse invalide");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new UnsafeUrlError("Seuls http et https sont acceptés");
  if (url.username || url.password) throw new UnsafeUrlError("Les identifiants dans l'adresse ne sont pas acceptés");
  if (options.allowPrivateNetwork) return url;

  if (!ALLOWED_PORTS.has(url.port)) throw new UnsafeUrlError("Port non autorisé");
  const host = stripBrackets(url.hostname).toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host === "") {
    throw new UnsafeUrlError("Adresse locale non autorisée");
  }
  if (isIP(host) && isPrivateAddress(host)) throw new UnsafeUrlError("Adresse privée non autorisée");
  return url;
}

type LookupCallback = (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;

/** Remplace `dns.lookup` pour node:http(s) : refuse la connexion si une adresse résolue est privée. */
export function safeLookup(hostname: string, options: LookupOptions, callback: LookupCallback): void {
  dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, "", 0);
    const list = addresses as LookupAddress[];
    const blocked = list.find((a) => isPrivateAddress(a.address));
    if (blocked || list.length === 0) {
      const error = new UnsafeUrlError("Adresse privée non autorisée") as unknown as NodeJS.ErrnoException;
      error.code = "EUNSAFEADDRESS";
      return callback(error, "", 0);
    }
    if (options.all) return callback(null, list);
    callback(null, list[0].address, list[0].family);
  });
}
