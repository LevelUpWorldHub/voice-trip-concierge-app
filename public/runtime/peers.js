/**
 * Resolves a peer-network URL the way the MVP spec describes:
 * the last path segment is the network name, and agent-manifest.json
 * lives at the site base in front of it.
 */

export function peerLocation(networkUrl) {
  const url = new URL(networkUrl);
  const parts = url.pathname.split("/").filter(Boolean);
  const name = parts.pop();
  if (!name) throw new Error(`Peer URL ${networkUrl} has no network name.`);
  const root = parts.length ? `${url.origin}/${parts.join("/")}/` : `${url.origin}/`;
  return {
    name,
    root,
    manifestUrl: new URL("agent-manifest.json", root).toString(),
  };
}

export function resolveNetworkRef(ref, origin) {
  if (/^https?:\/\//i.test(ref)) return ref;
  const path = ref.startsWith("/") ? ref : `/${ref}`;
  return new URL(path, origin).toString();
}

export async function fetchPeerNetwork(networkUrl, fetchImpl = fetch) {
  const location = peerLocation(networkUrl);
  const headers = { Accept: "application/json" };
  const manifestResponse = await fetchImpl(location.manifestUrl, { headers, credentials: "omit" });
  if (!manifestResponse.ok) {
    throw new Error(`Manifest request failed (${manifestResponse.status}) for ${location.manifestUrl}`);
  }
  const manifest = await manifestResponse.json();
  const entry = (manifest.networks || []).find((network) => network.name === location.name);
  if (!entry) throw new Error(`Manifest has no network named ${location.name}.`);
  const definitionUrl = new URL(entry.hocon, location.root).toString();
  const definitionResponse = await fetchImpl(definitionUrl, { headers, credentials: "omit" });
  if (!definitionResponse.ok) {
    throw new Error(`Network request failed (${definitionResponse.status}) for ${definitionUrl}`);
  }
  return {
    network: await definitionResponse.json(),
    frontMan: entry.front_man,
    origin: new URL(location.root).origin,
  };
}
