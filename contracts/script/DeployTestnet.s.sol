// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "forge-std/console2.sol";

import {ActionCatalog} from "../src/ActionCatalog.sol";
import {MerchantCallbackAdapter} from "../src/MerchantCallbackAdapter.sol";
import {ExecutionReceipt} from "../src/ExecutionReceipt.sol";

contract DeployTestnet is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address authorizedCore = vm.envAddress("AUTHORIZED_CORE");
        address usdcToken = vm.envAddress("PAYMENT_TOKEN_USDC");

        vm.startBroadcast(deployerPrivateKey);

        ActionCatalog actionCatalog = new ActionCatalog();
        MerchantCallbackAdapter callbackAdapter = new MerchantCallbackAdapter(authorizedCore);
        ExecutionReceipt executionReceipt = new ExecutionReceipt();

        actionCatalog.setAction(keccak256("analyze_url"), usdcToken, 100000, true, false);
        actionCatalog.setAction(keccak256("generate_report"), usdcToken, 250000, true, false);
        actionCatalog.setAction(keccak256("chain_brief"), usdcToken, 150000, true, false);
        actionCatalog.setAction(keccak256("premium_execute"), usdcToken, 500000, true, true);

        vm.stopBroadcast();

        console2.log("ActionCatalog:", address(actionCatalog));
        console2.log("MerchantCallbackAdapter:", address(callbackAdapter));
        console2.log("ExecutionReceipt:", address(executionReceipt));
    }
}
