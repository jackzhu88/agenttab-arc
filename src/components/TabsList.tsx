import { useReadContracts } from 'wagmi';
import type { Abi } from 'viem';
import { AGENT_TAB, TARGET_CHAIN_ID, type TabData } from '@/contracts';
import { TabCard } from './TabCard';

interface TabsListProps {
  maxTabId: bigint;
  onRefresh: () => void;
}

export function TabsList({ maxTabId, onRefresh }: TabsListProps) {
  // Build read calls for each tab id from 1..maxTabId
  const tabIds: bigint[] = [];
  for (let i = 1n; i <= maxTabId; i++) {
    tabIds.push(i);
  }

  const contracts = tabIds.map((id) => ({
    address: AGENT_TAB.address,
    abi: AGENT_TAB.abi as Abi,
    functionName: 'getTab' as const,
    args: [id] as const,
    chainId: TARGET_CHAIN_ID,
  }));

  const { data, isLoading } = useReadContracts({ contracts });

  if (maxTabId === 0n) {
    return (
      <div
        className="rounded-2xl p-8 text-center border"
        style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
      >
        <p className="text-sm" style={{ color: 'var(--muted)' }}>
          No tabs yet. Open one to get started.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        {tabIds.map((id) => (
          <div
            key={id.toString()}
            className="rounded-2xl p-5 border h-40 animate-pulse"
            style={{ borderColor: 'var(--border)', background: 'var(--surface-muted)' }}
          />
        ))}
      </div>
    );
  }

  const tabs: TabData[] = (data ?? [])
    .map((result, idx) => {
      if (result.status !== 'success' || !result.result) return null;
      const raw = result.result as {
        client: string;
        provider: string;
        pricePerCall: bigint;
        balance: bigint;
        active: boolean;
      };
      return {
        id: tabIds[idx],
        client: raw.client,
        provider: raw.provider,
        pricePerCall: raw.pricePerCall,
        balance: raw.balance,
        active: raw.active,
      } satisfies TabData;
    })
    .filter((t): t is TabData => t !== null);

  // Most recent first
  const sorted = [...tabs].reverse();

  return (
    <div className="space-y-3">
      {sorted.map((tab) => (
        <TabCard key={tab.id.toString()} tab={tab} onRefresh={onRefresh} />
      ))}
    </div>
  );
}
