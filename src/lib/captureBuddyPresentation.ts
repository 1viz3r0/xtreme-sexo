export function captureIssue(message: string) {
  if (/CAPTURE_SETUP/i.test(message)) return {
    title: 'One-time native recorder setup required',
    action: message.replace(/^CAPTURE_SETUP:\s*/i, ''),
  };
  if (/CAPTURE_RESTRICTED|NoNewPrivs/i.test(message)) return {
    title: 'Live recording is blocked by this launch environment',
    action: 'Close NET0ZE and open it yourself from the desktop application menu. If it is still restricted, ask your administrator to review the launch policy. You can review saved captures now.',
  };
  if (/CAP_NET_RAW|CAP_NET_ADMIN|permission|access.*denied|not permitted/i.test(message)) return {
    title: 'The operating system denied recording access',
    action: 'Native recording requires packet-capture access for NET0ZE on Linux, or Npcap access on Windows. Ask your administrator to review capture permissions. Saved-file review remains available; ordinary host traffic does not require monitor mode.',
  };
  if (/display filter|syntax|unexpected|isn.t a valid/i.test(message)) return {
    title: 'That filter could not be applied', action: 'Check the expression or choose one of the quick filters below.',
  };
  return { title: 'This operation could not finish', action: message.split('\n')[0].slice(0, 240) };
}

export function packetMeaning(protocol: string) {
  const meanings: Record<string, string> = {
    TCP: 'A TCP transport segment', UDP: 'A UDP datagram', DNS: 'A domain-name lookup message',
    ARP: 'A local-network address mapping message', ICMP: 'A network control message',
    ICMPV6: 'An IPv6 control message', HTTP: 'An HTTP message',
    TLS: 'A TLS session message', TLSV1: 'A TLS session message', 'TLSV1.2': 'A TLS session message', 'TLSV1.3': 'A TLS session message',
    QUIC: 'A QUIC transport message', DHCP: 'A network address configuration message',
  };
  return meanings[protocol.toUpperCase()] ?? `${protocol || 'Unclassified'} packet`;
}

export function summarizePage(packets: { source: string; destination: string; length: string; protocol: string }[]) {
  const endpoints = new Set<string>();
  const protocols = new Map<string, number>();
  let bytes = 0;
  for (const packet of packets) {
    if (packet.source) endpoints.add(packet.source);
    if (packet.destination) endpoints.add(packet.destination);
    const length = Number(packet.length);
    if (Number.isFinite(length) && length >= 0) bytes += length;
    protocols.set(packet.protocol || 'Unknown', (protocols.get(packet.protocol || 'Unknown') ?? 0) + 1);
  }
  return { endpoints: endpoints.size, bytes, protocols: [...protocols].sort((a, b) => b[1] - a[1]) };
}
