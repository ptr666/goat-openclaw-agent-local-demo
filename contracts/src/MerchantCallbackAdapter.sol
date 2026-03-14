// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract MerchantCallbackAdapter {
    address public owner;
    address public authorizedCore;

    struct Entitlement {
        bool paid;
        uint256 paidAt;
        bytes32 actionId;
    }

    mapping(bytes32 => Entitlement) public entitlements;

    event ActionPaid(bytes32 indexed orderId, address indexed payer, bytes32 indexed actionId, uint256 amount);

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    modifier onlyCore() {
        require(msg.sender == authorizedCore, "not core");
        _;
    }

    constructor(address _authorizedCore) {
        owner = msg.sender;
        authorizedCore = _authorizedCore;
    }

    function setAuthorizedCore(address _authorizedCore) external onlyOwner {
        authorizedCore = _authorizedCore;
    }

    function onX402Callback(bytes32 orderId, address payer, bytes32 actionId, uint256 amount) external onlyCore {
        entitlements[orderId] = Entitlement({ paid: true, paidAt: block.timestamp, actionId: actionId });
        emit ActionPaid(orderId, payer, actionId, amount);
    }
}
