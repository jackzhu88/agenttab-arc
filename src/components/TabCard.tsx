import { useState } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useSwitchChain } from 'wagmi';
import { Zap, X, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { AGENT_TAB, USDC_DECIMALS, TARGET_CHAIN_ID, type TabData } from '@/contracts';
import { Amount } from '@/onchain-money';
import { buildTxExplorerUrl, buildAddressExplorerUrl } from '@/onchain-facts';

function formatUSDC(raw: bigint): string {
  return Amount.fromRaw(raw, USDC_DECIMALS).toFixed(2);
}

function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

interface TabCardProps {
  tab: TabData;
  onRefresh: () => void;
}

export function TabCard({ tab, onRefresh }: TabCardProps) {
  const { address, chainId } = useAccount();
  const { switchChain } = useSwitchChain();
  const [numCallsInput, setNumCallsInput] = useState('1');

  const isClient = address?.toLowerCase() === tab.client.toLowerCase();
  const isProvider = address?.toLowerCase() === tab.provider.toLowerCase();

  // Claim calls write
  const {
    writeContract: writeClaim,
    data: claimHash,
    isPending: isClaimPending,
  } = useWriteContract();
  const { isLoading: isClaimConfirming, isSuccess: isClaimSuccess } =
    useWaitForTransactionReceipt({ hash: claimHash });

  // Close tab write
  const {
    writeContract: writeClose,
    data: closeHash,
    isPending: isClosePending,
  } = useWriteContract();
  const { isLoading: isCloseConfirming, isSuccess: isCloseSuccess } =
    useWaitForTransactionReceipt({ hash: closeHash });

  if (isClaimSuccess) {
    toast.success(`Claimed calls on tab #${tab.id}`);
    onRefresh();
  }
  if (isCloseSuccess) {
    toast.success(`Tab #${tab.id} closed`);
    onRefresh();
  }

  function ensureCorrectChain(): boolean {
    if (chainId !== TARGET_CHAIN_ID) {
      switchChain({ chainId: TARGET_CHAIN_ID });
      return false;
    }
    return true;
  }

  function handleClaim() {
    if (!ensureCorrectChain()) return;
    const n = BigInt(Math.max(1, parseInt(numCallsInput) || 1));
    writeClaim({
      address: AGENT_TAB.address,
      abi: AGENT_TAB.abi,
      functionName: 'claimCalls',
      args: [tab.id, n],
      chainId: TARGET_CHAIN_ID,
    });
  }

  function handleClose() {
    if (!ensureCorrectChain()) return;
    writeClose({
      address: AGENT_TAB.address,
      abi: AGENT_TAB.abi,
      functionName: 'closeTab',
      args: [tab.id],
      chainId: TARGET_CHAIN_ID,
    });
  }

  const claimableCount =
    tab.pricePerCall > 0n ? tab.balance / tab.pricePerCall : 0n;
  const priceFormatted = formatUSDC(tab.pricePerCall);
  const balanceFormatted = formatUSDC(tab.balance);

  return (
    <div
      className="rounded-2xl p-5 border"
      style={{
        background: 'var(--surface-strong)',
        borderColor: tab.active ? 'var(--border)' : 'var(--border)',
        opacity: tab.active ? 1 : 0.55,
      }}
    >
      {/* Header row */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-2">
          <span
            className="display text-xl font-semibold tabular-nums"
            style={{ color: 'var(--ink)' }}
          >
            Tab #{tab.id.toString()}
          </span>
          <span
            className="text-xs font-medium px-2 py-0.5 rounded-full"
            style={
              tab.active
                ? { background: '#dcfce7', color: 'var(--success)' }
                : { background: 'var(--surface-muted)', color: 'var(--muted)' }
            }
          >
            {tab.active ? 'Active' : 'Closed'}
          </span>
        </div>
        <a
          href={buildAddressExplorerUrl(TARGET_CHAIN_ID, AGENT_TAB.address)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs"
          style={{ color: 'var(--muted)' }}
        >
          Explorer <ExternalLink size={11} />
        </a>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <Stat label="Balance" value={`$${balanceFormatted}`} mono />
        <Stat label="Per Call" value={`$${priceFormatted}`} mono />
        <Stat label="Claimable" value={`${claimableCount} call${claimableCount !== 1n ? 's' : ''}`} />
      </div>

      {/* Addresses */}
      <div className="space-y-1.5 mb-4 text-xs" style={{ color: 'var(--muted)' }}>
        <AddressRow label="Client" address={tab.client} isYou={isClient} />
        <AddressRow label="Provider" address={tab.provider} isYou={isProvider} />
      </div>

      {/* Actions */}
      {tab.active && (
        <div className="flex gap-2 flex-wrap">
          {isProvider && (
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min="1"
                value={numCallsInput}
                onChange={(e) => setNumCallsInput(e.target.value)}
                className="w-16 px-2 py-1.5 rounded-lg text-sm border tabular-nums"
                style={{
                  background: 'var(--surface-muted)',
                  borderColor: 'var(--border)',
                  color: 'var(--ink)',
                  outline: 'none',
                }}
              />
              <button
                onClick={handleClaim}
                disabled={isClaimPending || isClaimConfirming}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-opacity disabled:opacity-50"
                style={{ background: 'var(--accent)', color: '#fff' }}
              >
                <Zap size={13} />
                {isClaimPending
                  ? 'Confirm…'
                  : isClaimConfirming
                  ? 'Claiming…'
                  : 'Claim Calls'}
              </button>
            </div>
          )}
          {isClient && (
            <button
              onClick={handleClose}
              disabled={isClosePending || isCloseConfirming}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-opacity disabled:opacity-50"
              style={{
                background: 'transparent',
                borderColor: 'var(--border-strong)',
                color: 'var(--ink-2)',
              }}
            >
              <X size={13} />
              {isClosePending
                ? 'Confirm…'
                : isCloseConfirming
                ? 'Closing…'
                : 'Close Tab'}
            </button>
          )}
          {!isClient && !isProvider && (
            <p className="text-xs" style={{ color: 'var(--subtle)' }}>
              Connect as client or provider to take action
            </p>
          )}
        </div>
      )}

      {/* Tx links */}
      {claimHash && (
        <TxLink chainId={TARGET_CHAIN_ID} hash={claimHash} label="Claim tx" />
      )}
      {closeHash && (
        <TxLink chainId={TARGET_CHAIN_ID} hash={closeHash} label="Close tx" />
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div
      className="rounded-xl px-3 py-2"
      style={{ background: 'var(--surface-muted)' }}
    >
      <p className="text-xs mb-0.5" style={{ color: 'var(--subtle)' }}>
        {label}
      </p>
      <p
        className={`text-sm font-semibold tabular-nums ${mono ? 'mono' : ''}`}
        style={{ color: 'var(--ink)' }}
      >
        {value}
      </p>
    </div>
  );
}

function AddressRow({
  label,
  address,
  isYou,
}: {
  label: string;
  address: string;
  isYou: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span style={{ color: 'var(--subtle)' }}>{label}:</span>
      <span className="mono" style={{ color: 'var(--ink-2)' }}>
        {shortAddr(address)}
      </span>
      {isYou && (
        <span
          className="text-xs px-1.5 py-0.5 rounded font-medium"
          style={{ background: 'var(--surface-muted)', color: 'var(--muted)' }}
        >
          you
        </span>
      )}
    </div>
  );
}

function TxLink({ chainId, hash, label }: { chainId: number; hash: string; label: string }) {
  return (
    <a
      href={buildTxExplorerUrl(chainId, hash)}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-1 text-xs mt-2"
      style={{ color: 'var(--muted)' }}
    >
      {label} <ExternalLink size={11} />
    </a>
  );
}
