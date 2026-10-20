# AgentTab on Arc

**Prepaid USDC tabs for AI agents, on Arc mainnet.** A client agent deposits USDC into a tab for a service provider at a fixed price per call. The provider claims whole calls as it serves them. The client can close the tab at any time and gets back the unused balance. No subscriptions, no per-call on-chain payment to the client, no custodian.

- Live app (GitHub Pages): https://jackzhu88.github.io/agenttab-arc/
- Contract (Arc mainnet, chain 5042): [0x3E708645283Ea43744642DC1d5a44B36E1b5A7D4](https://explorer.arc.io/address/0x3E708645283Ea43744642DC1d5a44B36E1b5A7D4)
- USDC (ERC-20 interface, 6 decimals): 0x3600000000000000000000000000000000000000
- Arc Studio project: https://studio.arc.io/app/7d3ba647-4477-4ed0-bf3f-5dce2e13e521

## How it works
| Function | Who | What |
|---|---|---|
| `openTab(provider, pricePerCall, deposit)` | client | pulls `deposit` USDC into escrow, returns `tabId` |
| `claimCalls(tabId, n)` | provider | takes `n × pricePerCall` (capped at whole calls the balance covers) |
| `closeTab(tabId)` | client | deactivates the tab, refunds the remaining balance |
| `getTab(tabId)` | anyone | reads the tab |

Checks-effects-interactions everywhere, custom errors, only whole calls claimable (dust is refunded on close).

## Built with Arc Studio
The contract, the Foundry test suite and the React/wagmi front end were generated and iterated in Arc Studio: spec → contract → tests (unit, fuzz and invariant tests) → Studio security review (two issues found and fixed) → Arc testnet deploy. The Studio export was then compiled with Foundry and **deployed unmodified** to Arc mainnet. For mainnet, the only front-end change was the chain/contract config (`src/config.ts`, `src/contracts.ts`).

## Mainnet demo (real USDC, tiny amounts)
In this demo the client and the provider are the same wallet (0xC18F…BB75), so one key can run every step.
1. Deploy: [0xc6f33e25…bb03](https://explorer.arc.io/tx/0xc6f33e25c38bf9fdf22a7bfd5f8899c9391f47d49043649ec7a51561afa4bb03)
2. approve 0.01 USDC: [0x9ddef3ef…66cf](https://explorer.arc.io/tx/0x9ddef3efcc01e00795d44cea0eabccd80133b2ed4ec772a213cd87c1758f66cf)
3. openTab (deposit 0.01 USDC, price 0.001/call) → tab #1: [0x535cde06…c553](https://explorer.arc.io/tx/0x535cde06b3acd2adf9cc1206b856331c329d3968bf5c223d5a015d3547d4c553)
4. claimCalls(1, 2) → provider gets 0.002, balance 0.008: [0x37dd45cb…c5cd](https://explorer.arc.io/tx/0x37dd45cb8c26d7e96c9c0ba74985b3fed2dac2118a5fa34880e7769940d7c5cd)
5. closeTab(1) → 0.008 refunded, tab inactive: [0x376eaff5…be70](https://explorer.arc.io/tx/0x376eaff50d54453261f852dd2838d6554151cdcb9a568110fbfe6b326123be70)

The whole demo cost about 0.0207 USDC in gas.

## Tests
```
bun install && forge test
# 47 tests passed, 0 failed (unit + fuzz + invariant: 256 runs × 128,000 calls, 0 reverts)
```

## Run the app
```
bun install && bun run dev      # or: npx vite build --base=./
```
Connect an injected wallet on Arc mainnet (chain 5042, RPC https://rpc.mainnet.arc.io).

License: MIT
