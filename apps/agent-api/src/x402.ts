export type PaymentProvider = 'mock' | 'x402';

export type X402CreateOrderInput = {
  dappOrderId: string;
  chainId: number;
  tokenSymbol: string;
  tokenContract?: string;
  fromAddress: string;
  amountWei: string;
  callbackCalldata?: string;
  metadata?: Record<string, unknown>;
  extraBody?: Record<string, unknown>;
};

export type X402CreateOrderResult = {
  httpStatus: number;
  orderId: string;
  rawStatus: string;
  paymentRequest: Record<string, unknown>;
  raw: unknown;
};

export type X402StatusResult = {
  httpStatus: number;
  rawStatus: string;
  raw: unknown;
};

export type X402ProofResult = {
  httpStatus: number;
  proofId: string;
  settledAt: string;
  note: string;
  raw: unknown;
};

import { createHmac, randomBytes, randomUUID } from 'node:crypto';

function getEnv(name: string, fallback?: string) {
  return process.env[name] || fallback || '';
}

function withTemplate(template: string, orderId: string) {
  return template.replaceAll('{orderId}', encodeURIComponent(orderId));
}

function normalizeSignValue(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function calculateSignature(params: Record<string, string>, secret: string) {
  const filtered = { ...params };
  delete filtered.sign;

  const signStr = Object.keys(filtered)
    .filter((key) => filtered[key] !== '')
    .sort()
    .map((key) => `${key}=${filtered[key]}`)
    .join('&');

  return createHmac('sha256', secret).update(signStr).digest('hex');
}

function buildHeaders(body?: unknown) {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['content-type'] = 'application/json';

  const apiKey = getEnv('GOATX402_API_KEY');
  const apiSecret = getEnv('GOATX402_API_SECRET');

  if (apiKey && apiSecret) {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = typeof randomUUID === 'function'
      ? randomUUID()
      : `${Date.now().toString(36)}-${randomBytes(12).toString('hex')}`;

    const signParams: Record<string, string> = {
      api_key: apiKey,
      timestamp,
      nonce,
    };

    if (body && typeof body === 'object') {
      for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
        if (value !== undefined && value !== null) {
          signParams[key] = normalizeSignValue(value);
        }
      }
    }

    const sign = calculateSignature(signParams, apiSecret);

    headers['X-API-Key'] = apiKey;
    headers['X-Timestamp'] = timestamp;
    headers['X-Nonce'] = nonce;
    headers['X-Sign'] = sign;
    return headers;
  }

  const authScheme = getEnv('GOATX402_AUTH_SCHEME', 'bearer').toLowerCase();
  const headerName = getEnv('GOATX402_API_KEY_HEADER', 'x-api-key');
  if (apiKey) {
    headers[headerName] = apiKey;
    if (authScheme === 'bearer') headers.authorization = `Bearer ${apiKey}`;
  }

  return headers;
}

async function fetchJson(url: string, init: RequestInit = {}) {
  const response = await fetch(url, init);
  const text = await response.text();
  let data: unknown = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  return {
    ok: response.ok,
    status: response.status,
    data,
  };
}

function readString(data: unknown, paths: string[], fallback = ''): string {
  for (const path of paths) {
    const value = path.split('.').reduce<unknown>((acc, key) => {
      if (!acc || typeof acc !== 'object') return undefined;
      return (acc as Record<string, unknown>)[key];
    }, data);
    if (typeof value === 'string' && value) return value;
    if (typeof value === 'number') return String(value);
  }
  return fallback;
}

function readObject(data: unknown): Record<string, unknown> {
  return data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
}

export function normalizeX402Status(rawStatus: string): 'payment_required' | 'payment_confirmed' | 'created' {
  const normalized = rawStatus.trim().toUpperCase();

  if (
    [
      'PAYMENT_CONFIRMED',
      'INVOICED',
      'COMPLETED',
      'SETTLED',
      'SUCCESS',
      'PAID',
      'CONFIRMED',
    ].includes(normalized)
  ) {
    return 'payment_confirmed';
  }

  if (
    [
      'CHECKOUT_VERIFIED',
      'PAYMENT_REQUIRED',
      'PENDING_PAYMENT',
      'AWAITING_PAYMENT',
      'CREATED',
      'PENDING',
    ].includes(normalized)
  ) {
    return 'payment_required';
  }

  return 'created';
}

export function decimalToTokenUnits(amount: string, decimals: number) {
  const [wholePart, fractionalPart = ''] = amount.split('.');
  const whole = wholePart.replace(/^0+(?=\d)/, '') || '0';
  const fraction = `${fractionalPart}${'0'.repeat(decimals)}`.slice(0, decimals);
  return `${whole}${fraction}`.replace(/^0+(?=\d)/, '') || '0';
}

export async function createX402Order(input: X402CreateOrderInput): Promise<X402CreateOrderResult> {
  const baseUrl = getEnv('GOATX402_API_URL', 'http://localhost:8286').replace(/\/$/, '');
  const orderPath = getEnv('GOATX402_ORDER_PATH', '/api/v1/orders');
  const merchantId = getEnv('GOATX402_MERCHANT_ID');
  const body = {
    dapp_order_id: input.dappOrderId,
    merchant_id: getEnv('GOATX402_INCLUDE_MERCHANT_ID', 'false') === 'true' ? merchantId || undefined : undefined,
    chain_id: input.chainId,
    token_symbol: input.tokenSymbol,
    token_contract: input.tokenContract,
    from_address: input.fromAddress,
    amount_wei: input.amountWei,
    callback_calldata: input.callbackCalldata,
    ...(getEnv('GOATX402_INCLUDE_METADATA', 'false') === 'true' ? { metadata: input.metadata } : {}),
    ...(input.extraBody || {}),
  };

  const result = await fetchJson(`${baseUrl}${orderPath}`, {
    method: 'POST',
    headers: buildHeaders(body),
    body: JSON.stringify(body),
  });

  const raw = readObject(result.data);
  const orderId = readString(result.data, ['order_id', 'orderId', 'data.order_id', 'data.orderId'], input.dappOrderId);
  const rawStatus = readString(
    result.data,
    ['status', 'order_status', 'data.status', 'data.order_status'],
    result.status === 402 ? 'PAYMENT_REQUIRED' : 'CREATED',
  );

  return {
    httpStatus: result.status,
    orderId,
    rawStatus,
    paymentRequest: raw,
    raw: result.data,
  };
}

export async function getX402Order(orderId: string): Promise<X402StatusResult> {
  const baseUrl = getEnv('GOATX402_API_URL', 'http://localhost:8286').replace(/\/$/, '');
  const pathTemplate = getEnv('GOATX402_STATUS_PATH_TEMPLATE', '/api/v1/orders/{orderId}');
  const result = await fetchJson(`${baseUrl}${withTemplate(pathTemplate, orderId)}`, {
    method: 'GET',
    headers: buildHeaders(),
  });

  return {
    httpStatus: result.status,
    rawStatus: readString(result.data, ['status', 'order_status', 'data.status', 'data.order_status'], 'UNKNOWN'),
    raw: result.data,
  };
}

export async function getX402Proof(orderId: string): Promise<X402ProofResult> {
  const baseUrl = getEnv('GOATX402_API_URL', 'http://localhost:8286').replace(/\/$/, '');
  const pathTemplate = getEnv('GOATX402_PROOF_PATH_TEMPLATE', '/api/v1/orders/{orderId}/proof');
  const result = await fetchJson(`${baseUrl}${withTemplate(pathTemplate, orderId)}`, {
    method: 'GET',
    headers: buildHeaders(),
  });

  const proofId = readString(result.data, ['proof_id', 'proofId', 'id', 'data.proof_id', 'data.proofId'], `proof_${orderId}`);
  const settledAt = readString(
    result.data,
    ['settled_at', 'settledAt', 'created_at', 'createdAt', 'data.settled_at', 'data.settledAt'],
    new Date().toISOString(),
  );

  return {
    httpStatus: result.status,
    proofId,
    settledAt,
    note: 'Fetched from GOAT x402 proof endpoint.',
    raw: result.data,
  };
}
