import { Type } from '@sinclair/typebox';

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

type FetchJsonOptions = {
  method?: 'GET' | 'POST';
  body?: unknown;
};

async function fetchJson(baseUrl: string, path: string, options: FetchJsonOptions = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method || 'GET',
    headers: options.body ? { 'content-type': 'application/json' } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

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

const ActionId = Type.Union([
  Type.Literal('analyze_url'),
  Type.Literal('generate_report'),
  Type.Literal('chain_brief'),
  Type.Literal('premium_execute'),
]);

const InputRecord = Type.Record(Type.String(), Type.Any());

export default function register(api: any) {
  const baseUrl = process.env.GOATPAY_API_BASE_URL || 'http://localhost:8787';

  api.registerGatewayMethod('goatpay.status', ({ respond }: any) => {
    respond(true, { ok: true, baseUrl });
  });

  api.registerCommand({
    name: 'goatpay-status',
    description: 'Show goatpay plugin status',
    requireAuth: false,
    handler: async () => ({ text: `goatpay ready: ${baseUrl}` }),
  });

  api.registerHttpRoute({
    path: '/goatpay/health',
    auth: 'plugin',
    match: 'exact',
    handler: async (_req: any, res: any) => {
      res.statusCode = 200;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ ok: true, plugin: 'goatpay', baseUrl }));
      return true;
    },
  });

  api.registerTool(
    {
      name: 'goatpay_quote_action',
      description: 'Get quote and pricing for a paid action.',
      parameters: Type.Object({
        actionId: ActionId,
      }),
      async execute(_id: string, params: { actionId: string }) {
        const result = await fetchJson(baseUrl, `/api/actions/${params.actionId}/quote`);
        return {
          content: [{ type: 'text', text: JSON.stringify(result.data, null, 2) }],
          details: result.data as JsonValue,
        };
      },
    },
    { optional: true },
  );

  api.registerTool(
    {
      name: 'goatpay_check_entitlement',
      description: 'Check whether a user/input combination is already paid for a specific action.',
      parameters: Type.Object({
        userId: Type.String({ minLength: 1 }),
        actionId: ActionId,
        input: Type.Optional(InputRecord),
      }),
      async execute(
        _id: string,
        params: { userId: string; actionId: string; input?: Record<string, unknown> },
      ) {
        const result = await fetchJson(baseUrl, '/api/entitlements/check', {
          method: 'POST',
          body: {
            userId: params.userId,
            actionId: params.actionId,
            input: params.input || {},
          },
        });
        return {
          content: [{ type: 'text', text: JSON.stringify(result.data, null, 2) }],
          details: result.data as JsonValue,
        };
      },
    },
    { optional: true },
  );

  api.registerTool(
    {
      name: 'goatpay_create_order',
      description: 'Create a paid action order. The backend returns HTTP 402 when payment is required.',
      parameters: Type.Object({
        userId: Type.String({ minLength: 1 }),
        walletAddress: Type.Optional(Type.String({ minLength: 1 })),
        actionId: ActionId,
        input: Type.Optional(InputRecord),
      }),
      async execute(
        _id: string,
        params: { userId: string; walletAddress?: string; actionId: string; input?: Record<string, unknown> },
      ) {
        const result = await fetchJson(baseUrl, '/api/payments/create-order', {
          method: 'POST',
          body: {
            userId: params.userId,
            walletAddress: params.walletAddress,
            actionId: params.actionId,
            input: params.input || {},
          },
        });
        return {
          content: [
            {
              type: 'text',
              text: `HTTP ${result.status}\n${JSON.stringify(result.data, null, 2)}`,
            },
          ],
          details: {
            status: result.status,
            ok: result.ok,
            response: result.data,
          } as { status: number; ok: boolean; response: JsonValue },
        };
      },
    },
    { optional: true },
  );

  api.registerTool(
    {
      name: 'goatpay_get_order_status',
      description: 'Get the current status of a paid action order.',
      parameters: Type.Object({
        orderId: Type.String({ minLength: 1 }),
      }),
      async execute(_id: string, params: { orderId: string }) {
        const result = await fetchJson(baseUrl, `/api/payments/${params.orderId}/status`);
        return {
          content: [{ type: 'text', text: JSON.stringify(result.data, null, 2) }],
          details: result.data as JsonValue,
        };
      },
    },
    { optional: true },
  );

  api.registerTool(
    {
      name: 'goatpay_get_order_proof',
      description: 'Fetch the payment proof for a confirmed order.',
      parameters: Type.Object({
        orderId: Type.String({ minLength: 1 }),
      }),
      async execute(_id: string, params: { orderId: string }) {
        const result = await fetchJson(baseUrl, `/api/payments/${params.orderId}/proof`);
        return {
          content: [{ type: 'text', text: JSON.stringify(result.data, null, 2) }],
          details: result.data as JsonValue,
        };
      },
    },
    { optional: true },
  );

  api.registerTool(
    {
      name: 'goatpay_mock_confirm_order',
      description: 'Demo-only helper to confirm a mock payment order during local testing.',
      parameters: Type.Object({
        orderId: Type.String({ minLength: 1 }),
      }),
      async execute(_id: string, params: { orderId: string }) {
        const result = await fetchJson(baseUrl, `/api/payments/${params.orderId}/mock-confirm`, {
          method: 'POST',
        });
        return {
          content: [{ type: 'text', text: JSON.stringify(result.data, null, 2) }],
          details: result.data as JsonValue,
        };
      },
    },
    { optional: true },
  );

  api.registerTool(
    {
      name: 'goatpay_execute_paid_action',
      description: 'Execute a paid action after payment has been confirmed.',
      parameters: Type.Object({
        orderId: Type.String({ minLength: 1 }),
      }),
      async execute(_id: string, params: { orderId: string }) {
        const result = await fetchJson(baseUrl, '/api/actions/run', {
          method: 'POST',
          body: { orderId: params.orderId },
        });
        return {
          content: [{ type: 'text', text: JSON.stringify(result.data, null, 2) }],
          details: result.data as JsonValue,
        };
      },
    },
    { optional: true },
  );

  api.registerTool(
    {
      name: 'goatpay_get_registration',
      description: 'Return the ERC-8004 registration JSON template for this agent.',
      parameters: Type.Object({}),
      async execute() {
        const result = await fetchJson(baseUrl, '/api/registration');
        return {
          content: [{ type: 'text', text: JSON.stringify(result.data, null, 2) }],
          details: result.data as JsonValue,
        };
      },
    },
    { optional: true },
  );
}
