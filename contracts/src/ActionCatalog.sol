// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract ActionCatalog {
    struct ActionConfig {
        address paymentToken;
        uint256 amount;
        bool active;
        bool delegateMode;
    }

    address public owner;
    mapping(bytes32 => ActionConfig) public actions;

    event ActionConfigured(bytes32 indexed actionId, address paymentToken, uint256 amount, bool active, bool delegateMode);

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function setAction(bytes32 actionId, address paymentToken, uint256 amount, bool active, bool delegateMode) external onlyOwner {
        actions[actionId] = ActionConfig({
            paymentToken: paymentToken,
            amount: amount,
            active: active,
            delegateMode: delegateMode
        });
        emit ActionConfigured(actionId, paymentToken, amount, active, delegateMode);
    }
}
