import { useState, useCallback } from 'react';
import { useReadContract, useAccount } from 'wagmi';
import { Plus, RotateCw } from 'lucide-react';
import { Header } from '@/components/Header';
import { TabsList } from '@/components/TabsList';
import { OpenTabModal } from '@/components/OpenTabModal';
import { AGENT_TAB, TARGET_CHAIN_ID, AGENT_TAB_ADDRESS } from '@/contracts';
import { buildAddressExplorerUrl } from '@/onchain-facts';

export default function App() {
  const [showModal, setShowModal] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const { isConnected } = useAccount();

  const refresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  // Read the current nextTabId to know how many tabs exist
  const { data: nextTabId, refetch: refetchNextTabId } = useReadContract({
    address: AGENT_TAB.address,
    abi: AGENT_TAB.abi,
    functionName: 'nextTabId',
    chainId: TARGET_CHAIN_ID,
    // re-read whenever refreshKey changes
    query: { refetchInterval: false },
  });

  const maxTabId = nextTabId ? (nextTabId as bigint) - 1n : 0n;

  function handleRefresh() {
    void refetchNextTabId();
    refresh();
  }

  return (
    <div className="min-h-dvh" style={{ background: 'var(--bg-gradient)' }}>
      <Header />

      <main className="max-w-2xl mx-auto px-4 py-8">
        {/* Hero */}
        <div className="mb-8">
          <h2
            className="display text-3xl font-semibold mb-2"
            style={{ color: 'var(--ink)', letterSpacing: '-0.03em' }}
          >
            Prepaid Call Tabs
          </h2>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            Agents deposit USDC into a tab for a provider. The provider claims calls as they
            are served. The client closes the tab and recovers the unused balance.
          </p>
          <a
            href={buildAddressExplorerUrl(TARGET_CHAIN_ID, AGENT_TAB_ADDRESS)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs mt-2"
            style={{ color: 'var(--subtle)' }}
          >
            Contract on Arc Explorer
          </a>
        </div>

        {/* Action bar */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <span
              className="display text-lg font-semibold"
              style={{ color: 'var(--ink-2)' }}
            >
              {maxTabId > 0n ? `${maxTabId} tab${maxTabId !== 1n ? 's' : ''}` : 'No tabs yet'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              className="w-9 h-9 rounded-xl flex items-center justify-center border transition-opacity hover:opacity-70"
              style={{
                background: 'var(--surface-strong)',
                borderColor: 'var(--border)',
                color: 'var(--muted)',
              }}
              title="Refresh"
            >
              <RotateCw size={15} />
            </button>
            {isConnected && (
              <button
                onClick={() => setShowModal(true)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold"
                style={{ background: 'var(--accent)', color: '#fff' }}
              >
                <Plus size={15} />
                Open Tab
              </button>
            )}
          </div>
        </div>

        {!isConnected && (
          <div
            className="rounded-2xl p-6 mb-6 border text-center"
            style={{
              background: 'var(--surface)',
              borderColor: 'var(--border)',
            }}
          >
            <p className="text-sm mb-1 font-medium" style={{ color: 'var(--ink-2)' }}>
              Connect your wallet to open tabs or claim calls
            </p>
            <p className="text-xs" style={{ color: 'var(--muted)' }}>
              Existing tabs are visible to everyone
            </p>
          </div>
        )}

        <TabsList key={refreshKey} maxTabId={maxTabId} onRefresh={handleRefresh} />
      </main>

      {showModal && (
        <OpenTabModal
          onClose={() => setShowModal(false)}
          onSuccess={() => {
            setShowModal(false);
            setTimeout(handleRefresh, 1500);
          }}
        />
      )}
    </div>
  );
}
