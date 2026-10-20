import artifact from '../contracts/out/AgentTab.sol/AgentTab.json';
import { getUsdc } from '@/onchain-facts';

const ARC_TESTNET_CHAIN_ID = 5042; // Arc mainnet

export const AGENT_TAB_ADDRESS = '0x3E708645283Ea43744642DC1d5a44B36E1b5A7D4' as const;

export const AGENT_TAB = {
  address: AGENT_TAB_ADDRESS,
  abi: artifact.abi,
} as const;

const usdcFact = getUsdc(ARC_TESTNET_CHAIN_ID)!;
export const USDC_ADDRESS = usdcFact.address as `0x${string}`;
export const USDC_DECIMALS = usdcFact.decimals;
export const TARGET_CHAIN_ID = ARC_TESTNET_CHAIN_ID;

export interface TabData {
  id: bigint;
  client: string;
  provider: string;
  pricePerCall: bigint;
  balance: bigint;
  active: boolean;
}
