// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract ExecutionReceipt {
    address public owner;

    struct Receipt {
        bytes32 outputHash;
        string resultURI;
        uint256 executedAt;
        address executor;
    }

    mapping(bytes32 => Receipt) public receipts;

    event ReceiptWritten(bytes32 indexed orderId, bytes32 outputHash, string resultURI, address executor);

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function writeReceipt(bytes32 orderId, bytes32 outputHash, string calldata resultURI, address executor) external onlyOwner {
        receipts[orderId] = Receipt({
            outputHash: outputHash,
            resultURI: resultURI,
            executedAt: block.timestamp,
            executor: executor
        });
        emit ReceiptWritten(orderId, outputHash, resultURI, executor);
    }
}
