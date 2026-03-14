import { encodeFunctionData, keccak256, stringToHex } from 'viem';

export function hashStringToBytes32(value: string) {
  return keccak256(stringToHex(value));
}

export function buildX402CallbackCalldata(args: {
  orderId: string;
  payer: string;
  actionId: string;
  amountWei: string;
}) {
  return encodeFunctionData({
    abi: [
      {
        type: 'function',
        name: 'onX402Callback',
        stateMutability: 'nonpayable',
        inputs: [
          { name: 'orderId', type: 'bytes32' },
          { name: 'payer', type: 'address' },
          { name: 'actionId', type: 'bytes32' },
          { name: 'amount', type: 'uint256' },
        ],
        outputs: [],
      },
    ],
    functionName: 'onX402Callback',
    args: [hashStringToBytes32(args.orderId), args.payer as `0x${string}`, hashStringToBytes32(args.actionId), BigInt(args.amountWei)],
  });
}
