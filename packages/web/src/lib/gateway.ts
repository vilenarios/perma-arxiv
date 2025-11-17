/**
 * Gateway utilities for dynamic Arweave gateway detection
 */

export function getGatewayBase(): string {
  const host = window.location.hostname;
  const protocol = window.location.protocol;

  // Extract gateway domain (everything after first dot for ArNS names)
  // arxiv.ar.io -> ar.io
  // arxiv.arweave.net -> arweave.net
  const parts = host.split('.');
  if (parts.length >= 2) {
    return `${protocol}//${parts.slice(-2).join('.')}`;
  }

  // Fallback for localhost/testing
  return 'https://arweave.net';
}

export function getDataUrl(): string {
  // When running locally, use the ArNS name directly
  if (isLocalhost()) {
    return 'https://data_arxiv.arweave.net';
  }

  // When deployed on Arweave, construct the data URL from the current gateway
  // Example: Running on arxiv.ar.io -> data_arxiv.ar.io
  const protocol = window.location.protocol;
  const host = window.location.hostname;
  const parts = host.split('.');

  if (parts.length >= 2) {
    const gateway = parts.slice(-2).join('.');
    return `${protocol}//data_arxiv.${gateway}`;
  }

  // Fallback
  return 'https://data_arxiv.arweave.net';
}

export function getTransactionUrl(txId: string): string {
  const gatewayBase = getGatewayBase();
  return `${gatewayBase}/${txId}`;
}

export function isLocalhost(): boolean {
  return window.location.hostname === 'localhost' ||
         window.location.hostname === '127.0.0.1';
}
