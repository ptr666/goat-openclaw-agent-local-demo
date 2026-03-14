import cors from 'cors';
import express, { type Express } from 'express';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { z } from 'zod';
import {
  createX402Order,
  decimalToTokenUnits,
  getX402Order,
  getX402Proof,
  normalizeX402Status,
  type PaymentProvider,
} from './x402.js';
import { buildX402CallbackCalldata } from './callback.js';

type ActionId = 'analyze_url' | 'generate_report' | 'chain_brief' | 'premium_execute';
type OrderStatus = 'created' | 'payment_required' | 'payment_confirmed' | 'executed';

type CatalogItem = {
  actionId: ActionId;
  amount: string;
  tokenSymbol: 'USDC';
  description: string;
  delegateMode: boolean;
};

type PaymentProof = {
  proofId: string;
  settledAt: string;
  note: string;
  raw?: unknown;
};

type PaymentState = {
  provider: PaymentProvider;
  remoteOrderId?: string;
  rawStatus?: string;
  paymentRequest?: unknown;
  lastSyncAt?: string;
};

type Order = {
  orderId: string;
  userId: string;
  walletAddress?: string;
  actionId: ActionId;
  input: Record<string, unknown>;
  amount: string;
  tokenSymbol: 'USDC';
  status: OrderStatus;
  createdAt: string;
  inputHash: string;
  entitlementKey: string;
  proof?: PaymentProof;
  payment: PaymentState;
  result?: unknown;
};

const PAYMENT_PROVIDER = (process.env.PAYMENT_PROVIDER || 'mock') as PaymentProvider;
const GOAT_CHAIN_ID = Number(process.env.GOAT_CHAIN_ID || 48816);
const GOAT_NETWORK_NAME = process.env.GOAT_NETWORK_NAME || 'GOAT Testnet3';
const IDENTITY_REGISTRY = process.env.IDENTITY_REGISTRY || '0xYourIdentityRegistry';
const AGENT_ID = Number(process.env.AGENT_ID || 1);
const AGENT_BASE_URL = process.env.AGENT_BASE_URL || `http://localhost:${process.env.PORT || 8787}`;
const REGISTRATION_IMAGE = process.env.REGISTRATION_IMAGE || 'ipfs://<cid>/agent.png';
const TOKEN_DECIMALS = Number(process.env.GOAT_TOKEN_DECIMALS || 6);
const DEFAULT_FROM_ADDRESS = process.env.GOAT_DEFAULT_FROM_ADDRESS || '0x0000000000000000000000000000000000000000';
const GOAT_USDC_TOKEN_CONTRACT = process.env.GOAT_USDC_TOKEN_CONTRACT || process.env.PAYMENT_TOKEN_USDC || '';
const X402_ENABLE_CALLBACK = process.env.X402_ENABLE_CALLBACK === 'true';
const X402_CALLBACK_ADAPTER = process.env.X402_CALLBACK_ADAPTER || '';
const X402_CALLBACK_CALLDATA_TEMPLATE = process.env.X402_CALLBACK_CALLDATA_TEMPLATE || '';

const catalog: Record<ActionId, CatalogItem> = {
  analyze_url: {
    actionId: 'analyze_url',
    amount: '0.10',
    tokenSymbol: 'USDC',
    description: 'Analyze a URL and return summary + risks.',
    delegateMode: false,
  },
  generate_report: {
    actionId: 'generate_report',
    amount: '0.25',
    tokenSymbol: 'USDC',
    description: 'Generate a structured report from input.',
    delegateMode: false,
  },
  chain_brief: {
    actionId: 'chain_brief',
    amount: '0.15',
    tokenSymbol: 'USDC',
    description: 'Generate a short on-chain brief.',
    delegateMode: false,
  },
  premium_execute: {
    actionId: 'premium_execute',
    amount: '0.50',
    tokenSymbol: 'USDC',
    description: 'Run a premium paid action.',
    delegateMode: true,
  },
};

const orders = new Map<string, Order>();

const createOrderSchema = z.object({
  userId: z.string().min(1),
  walletAddress: z.string().min(1).optional(),
  actionId: z.enum(['analyze_url', 'generate_report', 'chain_brief', 'premium_execute']),
  input: z.record(z.unknown()).default({}),
});

const runSchema = z.object({
  orderId: z.string().min(1),
});

const entitlementSchema = z.object({
  userId: z.string().min(1),
  actionId: z.enum(['analyze_url', 'generate_report', 'chain_brief', 'premium_execute']),
  input: z.record(z.unknown()).default({}),
});

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function hashInput(input: Record<string, unknown>) {
  return createHash('sha256').update(stableStringify(input)).digest('hex');
}

function buildEntitlementKey(userId: string, actionId: ActionId, input: Record<string, unknown>) {
  return `${userId}:${actionId}:${hashInput(input)}`;
}

function buildBlessing(order: Order) {
  const recipient = String(order.input.recipient || '朋友');
  const occasion = String(order.input.occasion || '今天');
  const style = String(order.input.style || '温暖');
  const sender = String(order.input.sender || '你');
  const toneMap: Record<string, string[]> = {
    温暖: [
      `愿${recipient}在${occasion}这一天被温柔对待，所有努力都被看见，所有期待都慢慢开花。`,
      `愿${recipient}接下来的日子，有光可追，有梦可赴，也有人认真珍惜每一分真心。`,
    ],
    幽默: [
      `祝${recipient}在${occasion}好运连连，烦恼像过期优惠券一样自动失效，快乐像消息提醒一样一条接一条。`,
      `愿${recipient}今天状态满格、灵感爆棚、钱包不瘦，连排队都能排到最快那一列。`,
    ],
    正式: [
      `值此${occasion}之际，谨祝${recipient}顺遂安康、所行皆稳、所愿可期，未来每一步都坚定从容。`,
      `愿${recipient}在新的阶段中持续精进、收获成长，并以清晰与勇气走向更广阔的天地。`,
    ],
  };
  const pool = toneMap[style] || toneMap['温暖'];
  const primary = pool[Math.abs(order.inputHash.charCodeAt(0) || 0) % pool.length];
  return {
    type: 'blessing',
    recipient,
    occasion,
    style,
    blessing: `${primary}\n\n—— 来自${sender}的祝福`,
  };
}

function buildMockResult(order: Order) {
  switch (order.actionId) {
    case 'analyze_url':
      return {
        summary: `Mock analysis for ${(order.input.url as string) || 'unknown URL'}`,
        risks: ['Unverified source', 'Needs deeper content fetch'],
      };
    case 'generate_report':
      if (order.input.product === 'blessing-studio') return buildBlessing(order);
      return { title: 'Mock Structured Report', sections: ['Summary', 'Key findings', 'Next steps'] };
    case 'chain_brief':
      return { network: GOAT_NETWORK_NAME, insight: 'This is a placeholder chain brief for MVP wiring.' };
    case 'premium_execute':
      return { ok: true, message: 'Premium action executed in current backend mode.' };
  }
}

function buildDelegateCallbackCalldata(order: Order, item: CatalogItem) {
  if (!item.delegateMode || !X402_ENABLE_CALLBACK) return undefined;
  const payer = (order.walletAddress || DEFAULT_FROM_ADDRESS) as `0x${string}`;
  const amountWei = decimalToTokenUnits(order.amount, TOKEN_DECIMALS);

  if (X402_CALLBACK_CALLDATA_TEMPLATE) {
    return X402_CALLBACK_CALLDATA_TEMPLATE
      .replaceAll('{orderId}', order.orderId)
      .replaceAll('{actionId}', order.actionId)
      .replaceAll('{amount}', order.amount)
      .replaceAll('{amountWei}', amountWei)
      .replaceAll('{userId}', order.userId)
      .replaceAll('{payer}', payer)
      .replaceAll('{inputHash}', order.inputHash)
      .replaceAll('{entitlementKey}', order.entitlementKey);
  }

  return buildX402CallbackCalldata({ orderId: order.orderId, payer, actionId: order.actionId, amountWei });
}

function buildRegistration() {
  return {
    type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
    name: 'OpenClaw GoatPay Agent',
    description: 'A pay-per-action autonomous agent built with OpenClaw, payable via x402 and deployed on GOAT Testnet3.',
    image: REGISTRATION_IMAGE,
    services: [
      { name: 'web', endpoint: `${AGENT_BASE_URL}/` },
      { name: 'x402', endpoint: `${AGENT_BASE_URL}/api/payments/create-order`, version: '1.0.0' },
      { name: 'actions', endpoint: `${AGENT_BASE_URL}/api/actions/run`, version: '1.0.0' },
    ],
    x402Support: true,
    active: true,
    registrations: [{ agentRegistry: `eip155:${GOAT_CHAIN_ID}:${IDENTITY_REGISTRY}`, agentId: AGENT_ID }],
    supportedTrust: ['reputation'],
  };
}

async function syncOrderWithProvider(order: Order) {
  if (order.payment.provider !== 'x402' || !order.payment.remoteOrderId) return order;
  const remote = await getX402Order(order.payment.remoteOrderId);
  order.payment.rawStatus = remote.rawStatus;
  order.payment.lastSyncAt = new Date().toISOString();
  order.payment.paymentRequest = remote.raw;

  const normalized = normalizeX402Status(remote.rawStatus);
  if (normalized === 'payment_confirmed') {
    order.status = 'payment_confirmed';
    if (!order.proof) {
      try {
        const proof = await getX402Proof(order.payment.remoteOrderId);
        order.proof = { proofId: proof.proofId, settledAt: proof.settledAt, note: proof.note, raw: proof.raw };
      } catch {}
    }
  } else if (order.status !== 'executed') {
    order.status = normalized;
  }

  orders.set(order.orderId, order);
  return order;
}

async function createOrderForAction(params: { userId: string; walletAddress?: string; actionId: ActionId; input: Record<string, unknown> }) {
  const { userId, walletAddress, actionId, input } = params;
  const item = catalog[actionId];
  const orderId = randomUUID();
  const inputHash = hashInput(input);
  const entitlementKey = buildEntitlementKey(userId, actionId, input);

  const order: Order = {
    orderId,
    userId,
    walletAddress,
    actionId,
    input,
    amount: item.amount,
    tokenSymbol: item.tokenSymbol,
    status: 'payment_required',
    createdAt: new Date().toISOString(),
    inputHash,
    entitlementKey,
    payment: { provider: PAYMENT_PROVIDER },
  };

  if (PAYMENT_PROVIDER === 'x402') {
    const remote = await createX402Order({
      dappOrderId: orderId,
      chainId: GOAT_CHAIN_ID,
      tokenSymbol: item.tokenSymbol,
      tokenContract: item.tokenSymbol === 'USDC' ? GOAT_USDC_TOKEN_CONTRACT || undefined : undefined,
      fromAddress: walletAddress || DEFAULT_FROM_ADDRESS,
      amountWei: decimalToTokenUnits(item.amount, TOKEN_DECIMALS),
      callbackCalldata: buildDelegateCallbackCalldata(order, item),
      metadata: {
        userId,
        actionId,
        inputHash,
        entitlementKey,
        delegateMode: item.delegateMode,
        callbackAdapter: item.delegateMode ? X402_CALLBACK_ADAPTER || null : null,
      },
      extraBody: item.delegateMode && X402_ENABLE_CALLBACK && X402_CALLBACK_ADAPTER ? { callback_contract: X402_CALLBACK_ADAPTER } : undefined,
    });

    order.payment.remoteOrderId = remote.orderId;
    order.payment.rawStatus = remote.rawStatus;
    order.payment.paymentRequest = remote.paymentRequest;
    order.payment.lastSyncAt = new Date().toISOString();
    order.status = normalizeX402Status(remote.rawStatus);
    orders.set(orderId, order);

    return {
      httpStatus: remote.httpStatus || 402,
      body: {
        orderId,
        remoteOrderId: remote.orderId,
        status: order.status,
        rawStatus: remote.rawStatus,
        provider: PAYMENT_PROVIDER,
        action: item,
        entitlementKey,
        paymentRequest: remote.paymentRequest,
      },
    };
  }

  order.payment.rawStatus = 'PAYMENT_REQUIRED';
  order.payment.paymentRequest = {
    network: `${GOAT_NETWORK_NAME} (mock)`,
    chainId: GOAT_CHAIN_ID,
    token: item.tokenSymbol,
    amount: item.amount,
    note: 'MVP mock x402 payment request. Replace with GOAT x402 createOrder later.',
  };
  order.payment.lastSyncAt = new Date().toISOString();
  orders.set(orderId, order);

  return {
    httpStatus: 402,
    body: {
      orderId,
      status: order.status,
      provider: PAYMENT_PROVIDER,
      action: item,
      entitlementKey,
      paymentRequest: order.payment.paymentRequest,
    },
  };
}

async function getExecutedBlessing(orderId: string) {
  const order = orders.get(orderId);
  if (!order) return { httpStatus: 404, body: { error: 'order_not_found' } };
  await syncOrderWithProvider(order);

  if (order.status !== 'payment_confirmed' && order.status !== 'executed') {
    return {
      httpStatus: 402,
      body: {
        error: 'payment_required',
        orderId: order.orderId,
        remoteOrderId: order.payment.remoteOrderId,
        status: order.status,
        paymentRequest: order.payment.paymentRequest,
      },
    };
  }

  if (!order.result) {
    order.result = buildMockResult(order);
    order.status = 'executed';
    orders.set(order.orderId, order);
  }

  return {
    httpStatus: 200,
    body: {
      orderId: order.orderId,
      remoteOrderId: order.payment.remoteOrderId,
      status: order.status,
      result: order.result,
      proof: order.proof,
    },
  };
}

export const app: Express = express();
const publicDir = path.resolve(process.cwd(), 'public');
app.use(cors());
app.use(express.json());
app.use(express.static(publicDir));

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'agent-api', network: GOAT_NETWORK_NAME, chainId: GOAT_CHAIN_ID, paymentProvider: PAYMENT_PROVIDER });
});

app.get('/api/catalog', (_req, res) => {
  res.json({ items: Object.values(catalog) });
});

app.get('/api/actions/:actionId/quote', (req, res) => {
  const item = catalog[req.params.actionId as ActionId];
  if (!item) return res.status(404).json({ error: 'action_not_found' });
  return res.json({ action: item, chainId: GOAT_CHAIN_ID, network: GOAT_NETWORK_NAME, provider: PAYMENT_PROVIDER });
});

app.post('/api/entitlements/check', (req, res) => {
  const parsed = entitlementSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_request', issues: parsed.error.flatten() });
  const { userId, actionId, input } = parsed.data;
  const entitlementKey = buildEntitlementKey(userId, actionId, input);
  const matched = [...orders.values()].find((order) => order.entitlementKey === entitlementKey && order.proof);
  return res.json({ entitled: Boolean(matched), entitlementKey, orderId: matched?.orderId ?? null, proof: matched?.proof ?? null });
});

app.post('/api/payments/create-order', async (req, res) => {
  const parsed = createOrderSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_request', issues: parsed.error.flatten() });
  const result = await createOrderForAction(parsed.data);
  return res.status(result.httpStatus).json(result.body);
});

app.get('/api/payments/:orderId/status', async (req, res) => {
  const order = orders.get(req.params.orderId);
  if (!order) return res.status(404).json({ error: 'order_not_found' });
  await syncOrderWithProvider(order);
  return res.json(order);
});

app.post('/api/payments/:orderId/mock-confirm', (req, res) => {
  const order = orders.get(req.params.orderId);
  if (!order) return res.status(404).json({ error: 'order_not_found' });
  if (order.payment.provider !== 'mock') return res.status(409).json({ error: 'mock_confirm_disabled_for_real_provider' });
  order.status = 'payment_confirmed';
  order.payment.rawStatus = 'PAYMENT_CONFIRMED';
  order.payment.lastSyncAt = new Date().toISOString();
  order.proof = { proofId: `proof_${order.orderId}`, settledAt: new Date().toISOString(), note: 'Mock payment proof. Replace with x402 getOrderProof.' };
  orders.set(order.orderId, order);
  return res.json(order);
});

app.post('/api/payments/:orderId/sync', async (req, res) => {
  const order = orders.get(req.params.orderId);
  if (!order) return res.status(404).json({ error: 'order_not_found' });
  await syncOrderWithProvider(order);
  return res.json(order);
});

app.get('/api/payments/:orderId/proof', async (req, res) => {
  const order = orders.get(req.params.orderId);
  if (!order) return res.status(404).json({ error: 'order_not_found' });
  if (order.payment.provider === 'x402' && order.payment.remoteOrderId && !order.proof) {
    await syncOrderWithProvider(order);
    if (!order.proof && order.status === 'payment_confirmed') {
      const proof = await getX402Proof(order.payment.remoteOrderId);
      order.proof = { proofId: proof.proofId, settledAt: proof.settledAt, note: proof.note, raw: proof.raw };
      orders.set(order.orderId, order);
    }
  }
  if (!order.proof) return res.status(409).json({ error: 'payment_not_confirmed' });
  return res.json(order.proof);
});

app.post('/api/actions/run', async (req, res) => {
  const parsed = runSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_request', issues: parsed.error.flatten() });
  const order = orders.get(parsed.data.orderId);
  if (!order) return res.status(404).json({ error: 'order_not_found' });
  await syncOrderWithProvider(order);
  if (order.status !== 'payment_confirmed' && order.status !== 'executed') {
    return res.status(402).json({ error: 'payment_required', orderId: order.orderId, status: order.status });
  }
  if (!order.result) {
    order.result = buildMockResult(order);
    order.status = 'executed';
    orders.set(order.orderId, order);
  }
  return res.json({ orderId: order.orderId, remoteOrderId: order.payment.remoteOrderId, status: order.status, result: order.result, proof: order.proof, provider: order.payment.provider });
});

app.get('/api/demo/config', (_req, res) => {
  res.json({
    appName: 'Goat Blessing Studio',
    network: GOAT_NETWORK_NAME,
    chainId: GOAT_CHAIN_ID,
    paymentProvider: PAYMENT_PROVIDER,
    actionId: 'generate_report',
    price: catalog.generate_report.amount,
    tokenSymbol: catalog.generate_report.tokenSymbol,
    callbackEnabled: X402_ENABLE_CALLBACK,
  });
});

app.post('/api/demo/blessings/order', async (req, res) => {
  const body = req.body || {};
  const result = await createOrderForAction({
    userId: String(body.userId || 'web-demo-user'),
    walletAddress: body.walletAddress ? String(body.walletAddress) : undefined,
    actionId: 'generate_report',
    input: {
      product: 'blessing-studio',
      recipient: String(body.recipient || '朋友'),
      occasion: String(body.occasion || '生日'),
      style: String(body.style || '温暖'),
      sender: String(body.sender || '你'),
      notes: String(body.notes || ''),
    },
  });
  return res.status(result.httpStatus).json(result.body);
});

app.get('/api/demo/blessings/:orderId', async (req, res) => {
  const result = await getExecutedBlessing(req.params.orderId);
  return res.status(result.httpStatus).json(result.body);
});

app.get('/api/registration', (_req, res) => {
  res.json(buildRegistration());
});

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(publicDir, 'index.html'));
});

if (process.env.VERCEL !== '1') {
  const port = Number(process.env.PORT || 8787);
  app.listen(port, () => {
    console.log(`agent-api listening on http://localhost:${port}`);
  });
}
