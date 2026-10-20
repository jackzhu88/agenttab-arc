// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract AgentTab {
    struct Tab {
        address client;
        address provider;
        uint256 pricePerCall;
        uint256 balance;
        bool active;
    }

    IERC20 public immutable usdc;
    uint256 public nextTabId;
    mapping(uint256 => Tab) public tabs;

    error NotProvider();
    error NotClient();
    error TabNotActive();
    error InvalidParams();
    error ZeroAddress();

    event TabOpened(
        uint256 indexed tabId,
        address indexed client,
        address indexed provider,
        uint256 pricePerCall,
        uint256 initialDeposit
    );

    event CallsClaimed(
        uint256 indexed tabId,
        address indexed provider,
        uint256 numCalls,
        uint256 amount,
        uint256 remainingBalance
    );

    event TabClosed(uint256 indexed tabId, address indexed client, uint256 refundAmount);

    constructor(address _usdc) {
        if (_usdc == address(0)) revert ZeroAddress();

        usdc = IERC20(_usdc);
        nextTabId = 1;
    }

    function openTab(address provider, uint256 pricePerCall, uint256 initialDeposit) external returns (uint256 tabId) {
        if (provider == address(0)) revert ZeroAddress();
        if (pricePerCall == 0 || initialDeposit < pricePerCall) revert InvalidParams();

        bool success = usdc.transferFrom(msg.sender, address(this), initialDeposit);
        require(success, "USDC transferFrom failed");

        tabId = nextTabId;
        nextTabId = tabId + 1;

        tabs[tabId] = Tab({
            client: msg.sender,
            provider: provider,
            pricePerCall: pricePerCall,
            balance: initialDeposit,
            active: true
        });

        emit TabOpened(tabId, msg.sender, provider, pricePerCall, initialDeposit);
    }

    function claimCalls(uint256 tabId, uint256 numCalls) external {
        if (numCalls == 0) revert InvalidParams();

        Tab storage tab = tabs[tabId];

        if (msg.sender != tab.provider) revert NotProvider();
        if (!tab.active) revert TabNotActive();

        // Only whole calls are claimable; any sub-price dust stays for closeTab refund.
        uint256 claimable = tab.balance / tab.pricePerCall;
        if (claimable == 0) revert InvalidParams();
        if (numCalls > claimable) numCalls = claimable;

        uint256 amount = numCalls * tab.pricePerCall;

        // CEI: update state before external call.
        tab.balance -= amount;

        bool success = usdc.transfer(tab.provider, amount);
        require(success, "USDC transfer failed");

        emit CallsClaimed(tabId, tab.provider, numCalls, amount, tab.balance);
    }

    function closeTab(uint256 tabId) external {
        Tab storage tab = tabs[tabId];

        if (msg.sender != tab.client) revert NotClient();
        if (!tab.active) revert TabNotActive();

        tab.active = false;

        uint256 refundAmount = tab.balance;

        if (refundAmount > 0) {
            tab.balance = 0;
            bool success = usdc.transfer(tab.client, refundAmount);
            require(success, "USDC transfer failed");
        }

        emit TabClosed(tabId, tab.client, refundAmount);
    }

    function getTab(uint256 tabId) external view returns (Tab memory) {
        return tabs[tabId];
    }
}
