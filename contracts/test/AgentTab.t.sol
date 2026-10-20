// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test}     from "forge-std/Test.sol";
import {AgentTab} from "../AgentTab.sol";
import {MockERC20} from "../test-helpers/MockERC20.sol";

// ─────────────────────────────────────────────────────────────────────────────
//  Handler used by the invariant suite
// ─────────────────────────────────────────────────────────────────────────────
contract AgentTabHandler is Test {
    AgentTab   public tab;
    MockERC20  public usdc;

    address internal alice = makeAddr("alice");
    address internal bob   = makeAddr("bob");

    uint256 public lastTabId;

    /// @dev Running tally of USDC the handler has deposited into active tabs.
    ///      Incremented on openTab, decremented on claimCalls and closeTab.
    uint256 public trackedBalance;

    constructor(AgentTab _tab, MockERC20 _usdc) {
        tab  = _tab;
        usdc = _usdc;
    }

    /// Open a tab with bounded, valid params; tracks latest tabId and deposits.
    function openTab(uint256 price, uint256 deposit) external {
        price   = bound(price,   1,     1_000e6);
        deposit = bound(deposit, price, price * 100);

        usdc.mint(alice, deposit);

        vm.startPrank(alice);
        usdc.approve(address(tab), deposit);
        lastTabId = tab.openTab(bob, price, deposit);
        vm.stopPrank();

        trackedBalance += deposit;
    }

    /// Claim a bounded number of calls (may clamp internally); track the payout.
    function claimCalls(uint256 calls) external {
        if (lastTabId == 0) return;
        AgentTab.Tab memory t = tab.getTab(lastTabId);
        if (!t.active) return;
        if (t.balance < t.pricePerCall) return;

        calls = bound(calls, 1, t.balance / t.pricePerCall + 5); // +5 exercises clamping

        uint256 beforeBob = usdc.balanceOf(bob);

        vm.prank(bob);
        tab.claimCalls(lastTabId, calls);

        uint256 paid = usdc.balanceOf(bob) - beforeBob;
        trackedBalance -= paid;
    }

    /// Close the last tab as the client; track the refund.
    function closeTab() external {
        if (lastTabId == 0) return;
        AgentTab.Tab memory t = tab.getTab(lastTabId);
        if (!t.active) return;

        uint256 beforeAlice = usdc.balanceOf(alice);

        vm.prank(alice);
        tab.closeTab(lastTabId);

        uint256 refunded = usdc.balanceOf(alice) - beforeAlice;
        trackedBalance -= refunded;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Main test contract
// ─────────────────────────────────────────────────────────────────────────────
contract AgentTabTest is Test {
    // ── fixtures ──────────────────────────────────────────────────────────────
    AgentTab  internal agentTab;
    MockERC20 internal usdc;

    address internal alice    = makeAddr("alice");    // client
    address internal bob      = makeAddr("bob");      // provider
    address internal stranger = makeAddr("stranger"); // neither

    uint256 internal constant PRICE   = 10e6;   // 10 USDC per call
    uint256 internal constant DEPOSIT = 100e6;  // 10 calls worth

    function setUp() public {
        usdc     = new MockERC20("Mock USDC", "mUSDC", 6);
        agentTab = new AgentTab(address(usdc));

        // Fund alice and pre-approve for convenience
        usdc.mint(alice, 10_000e6);
        vm.prank(alice);
        usdc.approve(address(agentTab), type(uint256).max);
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    /// Opens a standard tab and returns its id.
    function _openTab() internal returns (uint256) {
        vm.prank(alice);
        return agentTab.openTab(bob, PRICE, DEPOSIT);
    }

    // =========================================================================
    //  1. CONSTRUCTOR
    // =========================================================================

    function test_Constructor_SetsUSDC() public view {
        assertEq(address(agentTab.usdc()), address(usdc));
    }

    function test_Constructor_NextTabIdStartsAtOne() public view {
        assertEq(agentTab.nextTabId(), 1);
    }

    function test_Constructor_RevertsOnZeroAddress() public {
        vm.expectRevert(AgentTab.ZeroAddress.selector);
        new AgentTab(address(0));
    }

    // =========================================================================
    //  2. openTab — happy path
    // =========================================================================

    function test_OpenTab_ReturnsTabId1() public {
        uint256 id = _openTab();
        assertEq(id, 1);
    }

    function test_OpenTab_IncreasesNextTabId() public {
        _openTab();
        assertEq(agentTab.nextTabId(), 2);
    }

    function test_OpenTab_StoresTabCorrectly() public {
        uint256 id = _openTab();
        AgentTab.Tab memory t = agentTab.getTab(id);

        assertEq(t.client,       alice);
        assertEq(t.provider,     bob);
        assertEq(t.pricePerCall, PRICE);
        assertEq(t.balance,      DEPOSIT);
        assertTrue(t.active);
    }

    function test_OpenTab_PullsUSDCFromClient() public {
        uint256 before = usdc.balanceOf(alice);
        _openTab();
        assertEq(usdc.balanceOf(alice),            before - DEPOSIT);
        assertEq(usdc.balanceOf(address(agentTab)), DEPOSIT);
    }

    function test_OpenTab_EmitsTabOpened() public {
        vm.prank(alice);
        vm.expectEmit(true, true, true, true, address(agentTab));
        emit AgentTab.TabOpened(1, alice, bob, PRICE, DEPOSIT);
        agentTab.openTab(bob, PRICE, DEPOSIT);
    }

    function test_OpenTab_MultipleTabsGetSequentialIds() public {
        uint256 id1 = _openTab();

        // Give alice more allowance headroom (already max-approved)
        vm.prank(alice);
        uint256 id2 = agentTab.openTab(bob, PRICE, DEPOSIT);

        assertEq(id1, 1);
        assertEq(id2, 2);
        assertEq(agentTab.nextTabId(), 3);
    }

    // =========================================================================
    //  2b. openTab — revert paths
    // =========================================================================

    function test_OpenTab_RevertsOnZeroProviderAddress() public {
        vm.prank(alice);
        vm.expectRevert(AgentTab.ZeroAddress.selector);
        agentTab.openTab(address(0), PRICE, DEPOSIT);
    }

    function test_OpenTab_RevertsOnZeroPricePerCall() public {
        vm.prank(alice);
        vm.expectRevert(AgentTab.InvalidParams.selector);
        agentTab.openTab(bob, 0, DEPOSIT);
    }

    function test_OpenTab_RevertsWhenDepositLessThanPrice() public {
        vm.prank(alice);
        vm.expectRevert(AgentTab.InvalidParams.selector);
        agentTab.openTab(bob, PRICE, PRICE - 1);
    }

    function test_OpenTab_AllowsDepositExactlyEqualToPrice() public {
        vm.prank(alice);
        uint256 id = agentTab.openTab(bob, PRICE, PRICE); // exactly 1 call worth
        AgentTab.Tab memory t = agentTab.getTab(id);
        assertEq(t.balance, PRICE);
        assertTrue(t.active);
    }

    function test_OpenTab_RevertsWhenTransferFromFails_NoApproval() public {
        address carol = makeAddr("carol");
        usdc.mint(carol, DEPOSIT);
        // carol has NOT approved agentTab
        vm.prank(carol);
        vm.expectRevert(); // transferFrom reverts (insufficient allowance)
        agentTab.openTab(bob, PRICE, DEPOSIT);
    }

    // =========================================================================
    //  3. claimCalls — happy path
    // =========================================================================

    function test_ClaimCalls_TransfersExactAmount() public {
        uint256 id = _openTab();
        uint256 before = usdc.balanceOf(bob);

        vm.prank(bob);
        agentTab.claimCalls(id, 3);

        assertEq(usdc.balanceOf(bob), before + 3 * PRICE);
    }

    function test_ClaimCalls_DecrementsTabBalance() public {
        uint256 id = _openTab();

        vm.prank(bob);
        agentTab.claimCalls(id, 3);

        AgentTab.Tab memory t = agentTab.getTab(id);
        assertEq(t.balance, DEPOSIT - 3 * PRICE);
    }

    function test_ClaimCalls_EmitsCallsClaimed() public {
        uint256 id = _openTab();

        vm.prank(bob);
        vm.expectEmit(true, true, false, true, address(agentTab));
        emit AgentTab.CallsClaimed(id, bob, 3, 3 * PRICE, DEPOSIT - 3 * PRICE);
        agentTab.claimCalls(id, 3);
    }

    function test_ClaimCalls_ClampsToMaxClaimable() public {
        // Deposit = 100e6, price = 10e6 → claimable = 10.
        // Ask for 999, should clamp to 10.
        uint256 id = _openTab();

        vm.prank(bob);
        agentTab.claimCalls(id, 999);

        AgentTab.Tab memory t = agentTab.getTab(id);
        // All 10 calls claimed → balance = 0
        assertEq(t.balance, 0);
        assertEq(usdc.balanceOf(bob), 10 * PRICE);
    }

    function test_ClaimCalls_ClampsPreserveDustBalance() public {
        // Deposit 105e6 → 10 full calls (100e6) + 5e6 dust.
        vm.prank(alice);
        uint256 id = agentTab.openTab(bob, PRICE, 105e6);

        vm.prank(bob);
        agentTab.claimCalls(id, 999); // ask for everything

        AgentTab.Tab memory t = agentTab.getTab(id);
        assertEq(t.balance, 5e6); // dust remains
    }

    function test_ClaimCalls_CanClaimOneByOne() public {
        uint256 id     = _openTab();
        uint256 before = usdc.balanceOf(bob);

        for (uint256 i = 0; i < 10; i++) {
            vm.prank(bob);
            agentTab.claimCalls(id, 1);
        }

        assertEq(usdc.balanceOf(bob), before + DEPOSIT);
        AgentTab.Tab memory t = agentTab.getTab(id);
        assertEq(t.balance, 0);
    }

    function test_ClaimCalls_TabRemainsActiveAfterClaiming() public {
        uint256 id = _openTab();

        vm.prank(bob);
        agentTab.claimCalls(id, 5);

        AgentTab.Tab memory t = agentTab.getTab(id);
        assertTrue(t.active);
    }

    // =========================================================================
    //  3b. claimCalls — revert paths
    // =========================================================================

    function test_ClaimCalls_RevertsIfNotProvider() public {
        uint256 id = _openTab();

        vm.prank(stranger);
        vm.expectRevert(AgentTab.NotProvider.selector);
        agentTab.claimCalls(id, 1);
    }

    function test_ClaimCalls_RevertsIfCallerIsClient() public {
        uint256 id = _openTab();

        vm.prank(alice);
        vm.expectRevert(AgentTab.NotProvider.selector);
        agentTab.claimCalls(id, 1);
    }

    function test_ClaimCalls_RevertsIfTabNotActive() public {
        uint256 id = _openTab();

        vm.prank(alice);
        agentTab.closeTab(id); // deactivate

        vm.prank(bob);
        vm.expectRevert(AgentTab.TabNotActive.selector);
        agentTab.claimCalls(id, 1);
    }

    function test_ClaimCalls_RevertsIfNumCallsIsZero() public {
        uint256 id = _openTab();

        vm.prank(bob);
        vm.expectRevert(AgentTab.InvalidParams.selector);
        agentTab.claimCalls(id, 0);
    }

    function test_ClaimCalls_RevertsIfBalanceLessThanOneCall() public {
        // Open a tab with exactly 1 call, claim it, then try again.
        vm.prank(alice);
        uint256 id = agentTab.openTab(bob, PRICE, PRICE);

        vm.prank(bob);
        agentTab.claimCalls(id, 1); // drains to zero

        vm.prank(bob);
        vm.expectRevert(AgentTab.InvalidParams.selector); // claimable == 0
        agentTab.claimCalls(id, 1);
    }

    function test_ClaimCalls_RevertsOnNonExistentTab() public {
        // Tab 999 has zero-value provider, so caller != provider → NotProvider
        vm.prank(bob);
        vm.expectRevert(AgentTab.NotProvider.selector);
        agentTab.claimCalls(999, 1);
    }

    // =========================================================================
    //  4. closeTab — happy path
    // =========================================================================

    function test_CloseTab_SetsActiveToFalse() public {
        uint256 id = _openTab();

        vm.prank(alice);
        agentTab.closeTab(id);

        AgentTab.Tab memory t = agentTab.getTab(id);
        assertFalse(t.active);
    }

    function test_CloseTab_RefundsFullBalanceToClient() public {
        uint256 id         = _openTab();
        uint256 beforeAlice = usdc.balanceOf(alice);

        vm.prank(alice);
        agentTab.closeTab(id);

        assertEq(usdc.balanceOf(alice), beforeAlice + DEPOSIT);
        assertEq(usdc.balanceOf(address(agentTab)), 0);
    }

    function test_CloseTab_RefundsPartialBalanceAfterClaims() public {
        uint256 id = _openTab();

        vm.prank(bob);
        agentTab.claimCalls(id, 7); // 70e6 claimed, 30e6 remains

        uint256 beforeAlice = usdc.balanceOf(alice);

        vm.prank(alice);
        agentTab.closeTab(id);

        assertEq(usdc.balanceOf(alice), beforeAlice + 30e6);
    }

    function test_CloseTab_ZeroRefundWhenBalanceDrained() public {
        uint256 id = _openTab();

        vm.prank(bob);
        agentTab.claimCalls(id, 999); // drain everything (clamped to 10 calls)

        uint256 beforeAlice = usdc.balanceOf(alice);

        vm.prank(alice);
        agentTab.closeTab(id);

        assertEq(usdc.balanceOf(alice), beforeAlice); // no refund
    }

    function test_CloseTab_EmitsTabClosed() public {
        uint256 id = _openTab();

        vm.prank(alice);
        vm.expectEmit(true, true, false, true, address(agentTab));
        emit AgentTab.TabClosed(id, alice, DEPOSIT);
        agentTab.closeTab(id);
    }

    function test_CloseTab_EmitsTabClosedWithZeroRefund() public {
        uint256 id = _openTab();

        vm.prank(bob);
        agentTab.claimCalls(id, 999); // drain

        vm.prank(alice);
        vm.expectEmit(true, true, false, true, address(agentTab));
        emit AgentTab.TabClosed(id, alice, 0);
        agentTab.closeTab(id);
    }

    function test_CloseTab_SetsBalanceToZero() public {
        uint256 id = _openTab();

        vm.prank(alice);
        agentTab.closeTab(id);

        AgentTab.Tab memory t = agentTab.getTab(id);
        assertEq(t.balance, 0);
    }

    // =========================================================================
    //  4b. closeTab — revert paths
    // =========================================================================

    function test_CloseTab_RevertsIfNotClient() public {
        uint256 id = _openTab();

        vm.prank(stranger);
        vm.expectRevert(AgentTab.NotClient.selector);
        agentTab.closeTab(id);
    }

    function test_CloseTab_RevertsIfCallerIsProvider() public {
        uint256 id = _openTab();

        vm.prank(bob);
        vm.expectRevert(AgentTab.NotClient.selector);
        agentTab.closeTab(id);
    }

    function test_CloseTab_RevertsIfAlreadyClosed() public {
        uint256 id = _openTab();

        vm.prank(alice);
        agentTab.closeTab(id); // first close

        vm.prank(alice);
        vm.expectRevert(AgentTab.TabNotActive.selector);
        agentTab.closeTab(id); // second close
    }

    function test_CloseTab_RevertsOnNonExistentTab() public {
        // Tab 999 has zero-value client, so caller != client → NotClient
        vm.prank(alice);
        vm.expectRevert(AgentTab.NotClient.selector);
        agentTab.closeTab(999);
    }

    // =========================================================================
    //  5. getTab — view
    // =========================================================================

    function test_GetTab_ReturnsCorrectStruct() public {
        uint256 id = _openTab();
        AgentTab.Tab memory t = agentTab.getTab(id);

        assertEq(t.client,       alice);
        assertEq(t.provider,     bob);
        assertEq(t.pricePerCall, PRICE);
        assertEq(t.balance,      DEPOSIT);
        assertTrue(t.active);
    }

    function test_GetTab_ReturnsZeroStructForNonExistentTab() public view {
        AgentTab.Tab memory t = agentTab.getTab(9999);
        assertEq(t.client,       address(0));
        assertEq(t.provider,     address(0));
        assertEq(t.pricePerCall, 0);
        assertEq(t.balance,      0);
        assertFalse(t.active);
    }

    // =========================================================================
    //  6. FUZZ — openTab
    // =========================================================================

    function testFuzz_OpenTab_BalanceMatchesDeposit(
        uint256 price,
        uint256 deposit
    ) public {
        price   = bound(price,   1,       1_000e6);
        deposit = bound(deposit, price,   price * 1_000);

        usdc.mint(alice, deposit);
        // alice already has max approval from setUp

        vm.prank(alice);
        uint256 id = agentTab.openTab(bob, price, deposit);

        AgentTab.Tab memory t = agentTab.getTab(id);
        assertEq(t.balance,      deposit);
        assertEq(t.pricePerCall, price);
        assertTrue(t.active);
    }

    function testFuzz_OpenTab_RevertsWhenDepositLessThanPrice(
        uint256 price,
        uint256 deposit
    ) public {
        price   = bound(price,   2,    1_000e6);          // need at least 2 so deposit can be < price
        deposit = bound(deposit, 0,    price - 1);

        vm.prank(alice);
        vm.expectRevert(AgentTab.InvalidParams.selector);
        agentTab.openTab(bob, price, deposit);
    }

    // =========================================================================
    //  7. FUZZ — claimCalls arithmetic
    // =========================================================================

    function testFuzz_ClaimCalls_BalanceDecrementCorrect(
        uint256 price,
        uint256 deposit,
        uint256 numCalls
    ) public {
        price    = bound(price,    1,      1_000e6);
        deposit  = bound(deposit,  price,  price * 200);
        numCalls = bound(numCalls, 1,      1_000);

        usdc.mint(alice, deposit);

        vm.prank(alice);
        uint256 id = agentTab.openTab(bob, price, deposit);

        uint256 claimable    = deposit / price;
        uint256 effectiveCalls = numCalls > claimable ? claimable : numCalls;
        uint256 expectedAmount = effectiveCalls * price;

        uint256 bobBefore = usdc.balanceOf(bob);

        vm.prank(bob);
        agentTab.claimCalls(id, numCalls);

        AgentTab.Tab memory t = agentTab.getTab(id);
        assertEq(t.balance,        deposit - expectedAmount, "wrong balance after claim");
        assertEq(usdc.balanceOf(bob), bobBefore + expectedAmount, "wrong bob transfer");
    }

    function testFuzz_ClaimCalls_NeverExceedsFullCalls(
        uint256 price,
        uint256 deposit
    ) public {
        price   = bound(price,   1,     1_000e6);
        deposit = bound(deposit, price, price * 500);

        usdc.mint(alice, deposit);

        vm.prank(alice);
        uint256 id = agentTab.openTab(bob, price, deposit);

        uint256 claimable = deposit / price;
        uint256 dust      = deposit % price;

        // Claim everything possible
        vm.prank(bob);
        agentTab.claimCalls(id, type(uint256).max); // should clamp to claimable

        AgentTab.Tab memory t = agentTab.getTab(id);
        assertEq(t.balance, dust,            "dust should remain");
        assertEq(usdc.balanceOf(bob), claimable * price, "bob should have exactly claimable*price");
    }

    // =========================================================================
    //  8. FUZZ — closeTab refund
    // =========================================================================

    function testFuzz_CloseTab_RefundEqualsRemainingBalance(
        uint256 price,
        uint256 deposit,
        uint256 claimCount
    ) public {
        price      = bound(price,      1,     500e6);
        deposit    = bound(deposit,    price, price * 100);
        claimCount = bound(claimCount, 0,     deposit / price);

        usdc.mint(alice, deposit);

        vm.prank(alice);
        uint256 id = agentTab.openTab(bob, price, deposit);

        if (claimCount > 0) {
            vm.prank(bob);
            agentTab.claimCalls(id, claimCount);
        }

        AgentTab.Tab memory tBefore = agentTab.getTab(id);
        uint256 remainingBalance     = tBefore.balance;
        uint256 aliceBefore          = usdc.balanceOf(alice);

        vm.prank(alice);
        agentTab.closeTab(id);

        assertEq(usdc.balanceOf(alice), aliceBefore + remainingBalance, "refund mismatch");
    }

    // =========================================================================
    //  9. FUZZ — no double-spend across claim + close
    // =========================================================================

    function testFuzz_NoDoubleSpend(
        uint256 price,
        uint256 deposit,
        uint256 claimCount
    ) public {
        price      = bound(price,      1,     500e6);
        deposit    = bound(deposit,    price, price * 100);
        claimCount = bound(claimCount, 0,     deposit / price);

        usdc.mint(alice, deposit);

        uint256 contractBefore = usdc.balanceOf(address(agentTab));
        uint256 bobBefore      = usdc.balanceOf(bob);
        uint256 aliceBefore    = usdc.balanceOf(alice);

        vm.prank(alice);
        uint256 id = agentTab.openTab(bob, price, deposit);

        if (claimCount > 0) {
            vm.prank(bob);
            agentTab.claimCalls(id, claimCount);
        }

        vm.prank(alice);
        agentTab.closeTab(id);

        // Total conservation: alice's out == bob's gain + alice's refund
        uint256 aliceNet  = aliceBefore - usdc.balanceOf(alice);   // net alice spent
        uint256 bobGain   = usdc.balanceOf(bob)   - bobBefore;
        uint256 aliceBack = deposit - aliceNet;                    // refund portion

        assertEq(bobGain + aliceBack, deposit,                 "total outflows != deposit");
        assertEq(usdc.balanceOf(address(agentTab)), contractBefore, "contract holds leftover USDC");
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Invariant test contract (stateful fuzzing)
// ─────────────────────────────────────────────────────────────────────────────
contract AgentTabInvariantTest is Test {
    AgentTab        internal agentTab;
    MockERC20       internal usdc;
    AgentTabHandler internal handler;

    function setUp() public {
        usdc     = new MockERC20("Mock USDC", "mUSDC", 6);
        agentTab = new AgentTab(address(usdc));
        handler  = new AgentTabHandler(agentTab, usdc);
        targetContract(address(handler));
    }

    /// @dev The AgentTab contract's USDC balance must equal the handler's
    ///      running tally of funds still inside the contract.
    ///      trackedBalance starts at 0, rises on openTab (deposit in),
    ///      and falls on claimCalls (payout out) and closeTab (refund out).
    function invariant_ContractBalanceEqualsTrackedBalance() public view {
        uint256 contractBal  = usdc.balanceOf(address(agentTab));
        uint256 trackedBal   = handler.trackedBalance();
        assertEq(contractBal, trackedBal, "contract USDC != tracked balance");
    }

    /// @dev pricePerCall must never change after a tab is opened.
    function invariant_PricePerCallIsImmutable() public view {
        if (handler.lastTabId() == 0) return;
        AgentTab.Tab memory t = agentTab.getTab(handler.lastTabId());
        assertGt(t.pricePerCall, 0, "pricePerCall became 0");
    }

    /// @dev nextTabId must always be strictly greater than the last opened tabId.
    function invariant_NextTabIdMonotonicallyIncreases() public view {
        uint256 nextId  = agentTab.nextTabId();
        uint256 lastId  = handler.lastTabId();
        if (lastId > 0) {
            assertGt(nextId, lastId, "nextTabId not greater than lastTabId");
        }
    }
}
