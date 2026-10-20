import { useState } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useSwitchChain } from 'wagmi';
import { erc20Abi } from 'viem';
import { X, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { AGENT_TAB, USDC_ADDRESS, USDC_DECIMALS, TARGET_CHAIN_ID } from '@/contracts';
import { parseUnitsExact } from '@/onchain-money';
import { buildTxExplorerUrl } from '@/onchain-facts';

interface OpenTabModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export function OpenTabModal({ onClose, onSuccess }: OpenTabModalProps) {
  const { chainId } = useAccount();
  const { switchChain } = useSwitchChain();

  const [provider, setProvider] = useState('');
  const [pricePerCall, setPricePerCall] = useState('0.01');
  const [deposit, setDeposit] = useState('1.00');
  const [toastFired, setToastFired] = useState(false);

  // Approve write
  const {
    writeContract: writeApprove,
    data: approveHash,
    isPending: isApprovePending,
  } = useWriteContract();
  const { isLoading: isApproveConfirming, isSuccess: isApproveSuccess } =
    useWaitForTransactionReceipt({ hash: approveHash });

  // OpenTab write
  const {
    writeContract: writeOpen,
    data: openHash,
    isPending: isOpenPending,
  } = useWriteContract();
  const { isLoading: isOpenConfirming, isSuccess: isOpenSuccess } =
    useWaitForTransactionReceipt({ hash: openHash });

  // Derive step from wagmi flags rather than local state
  // approve -> open (after approve confirmed) -> done (after open confirmed)
  const step: 'approve' | 'open' | 'done' = isOpenSuccess
    ? 'done'
    : isApproveSuccess
    ? 'open'
    : 'approve';

  // Fire toast + onSuccess exactly once when step reaches 'done'
  if (isOpenSuccess && !toastFired) {
    setToastFired(true);
    toast.success('Tab opened!');
    onSuccess();
  }

  function ensureChain(): boolean {
    if (chainId !== TARGET_CHAIN_ID) {
      switchChain({ chainId: TARGET_CHAIN_ID });
      return false;
    }
    return true;
  }

  function parseUsdc(val: string): bigint {
    try {
      return parseUnitsExact(val, USDC_DECIMALS);
    } catch {
      return 0n;
    }
  }

  function handleApprove() {
    if (!ensureChain()) return;
    const depositRaw = parseUsdc(deposit);
    if (depositRaw === 0n) return toast.error('Enter a valid deposit amount');
    if (!provider.startsWith('0x') || provider.length !== 42)
      return toast.error('Enter a valid provider address');
    writeApprove({
      address: USDC_ADDRESS,
      abi: erc20Abi,
      functionName: 'approve',
      args: [AGENT_TAB.address, depositRaw],
      chainId: TARGET_CHAIN_ID,
    });
  }

  function handleOpen() {
    if (!ensureChain()) return;
    const priceRaw = parseUsdc(pricePerCall);
    const depositRaw = parseUsdc(deposit);
    if (priceRaw === 0n) return toast.error('Enter a valid price per call');
    if (depositRaw < priceRaw) return toast.error('Deposit must be at least the per-call price');
    writeOpen({
      address: AGENT_TAB.address,
      abi: AGENT_TAB.abi,
      functionName: 'openTab',
      args: [provider as `0x${string}`, priceRaw, depositRaw],
      chainId: TARGET_CHAIN_ID,
    });
  }

  const isChainWrong = chainId !== TARGET_CHAIN_ID;
  const stepNum = step === 'done' ? 2 : step === 'open' ? 1 : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ background: 'rgba(18,45,69,0.4)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full max-w-md rounded-3xl p-6 border shadow-2xl"
        style={{
          background: 'var(--surface-strong)',
          borderColor: 'var(--border)',
        }}
      >
        {/* Modal header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="display text-lg font-semibold" style={{ color: 'var(--ink)' }}>
            Open a Tab
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: 'var(--surface-muted)', color: 'var(--muted)' }}
          >
            <X size={16} />
          </button>
        </div>

        {step === 'done' ? (
          <div className="text-center py-6">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3"
              style={{ background: '#dcfce7', color: 'var(--success)' }}
            >
              <span className="text-xl">✓</span>
            </div>
            <p className="font-medium" style={{ color: 'var(--ink)' }}>
              Tab opened!
            </p>
            {openHash && (
              <a
                href={buildTxExplorerUrl(TARGET_CHAIN_ID, openHash)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-1 text-sm mt-2"
                style={{ color: 'var(--muted)' }}
              >
                View transaction <ExternalLink size={12} />
              </a>
            )}
            <button
              onClick={onClose}
              className="mt-4 px-4 py-2 rounded-xl text-sm font-medium"
              style={{ background: 'var(--accent)', color: '#fff' }}
            >
              Close
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {isChainWrong && (
              <div
                className="rounded-xl px-3 py-2 text-sm"
                style={{ background: '#fef9c3', color: '#854d0e' }}
              >
                Wrong network — click a button below to switch to Arc Mainnet.
              </div>
            )}

            <Field
              label="Provider address"
              hint="The agent that will receive USDC when they claim calls"
            >
              <input
                type="text"
                placeholder="0x..."
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                disabled={step === 'open'}
                className="w-full px-3 py-2.5 rounded-xl text-sm border mono"
                style={{
                  background: 'var(--surface-muted)',
                  borderColor: 'var(--border)',
                  color: 'var(--ink)',
                  outline: 'none',
                }}
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Price per call" hint="USDC per call">
                <AmountInput
                  value={pricePerCall}
                  onChange={setPricePerCall}
                  disabled={step === 'open'}
                />
              </Field>
              <Field label="Initial deposit" hint="USDC to prepay">
                <AmountInput
                  value={deposit}
                  onChange={setDeposit}
                  disabled={step === 'open'}
                />
              </Field>
            </div>

            {/* Step progress */}
            <div className="flex items-center gap-2 py-1">
              <StepDot
                active={stepNum === 0}
                done={stepNum >= 1}
                label="1. Approve USDC"
              />
              <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
              <StepDot
                active={stepNum === 1}
                done={stepNum >= 2}
                label="2. Open Tab"
              />
            </div>

            {step === 'approve' ? (
              <button
                onClick={handleApprove}
                disabled={isApprovePending || isApproveConfirming}
                className="w-full py-3 rounded-2xl text-sm font-semibold transition-opacity disabled:opacity-50"
                style={{ background: 'var(--accent)', color: '#fff' }}
              >
                {isChainWrong
                  ? 'Switch to Arc Mainnet'
                  : isApprovePending
                  ? 'Confirm in wallet…'
                  : isApproveConfirming
                  ? 'Approving…'
                  : 'Approve USDC'}
              </button>
            ) : (
              <button
                onClick={handleOpen}
                disabled={isOpenPending || isOpenConfirming}
                className="w-full py-3 rounded-2xl text-sm font-semibold transition-opacity disabled:opacity-50"
                style={{ background: 'var(--accent)', color: '#fff' }}
              >
                {isChainWrong
                  ? 'Switch to Arc Mainnet'
                  : isOpenPending
                  ? 'Confirm in wallet…'
                  : isOpenConfirming
                  ? 'Opening tab…'
                  : 'Open Tab'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-medium mb-1" style={{ color: 'var(--ink-2)' }}>
        {label}
        {hint && (
          <span className="ml-1 font-normal" style={{ color: 'var(--subtle)' }}>
            — {hint}
          </span>
        )}
      </label>
      {children}
    </div>
  );
}

function AmountInput({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="relative">
      <span
        className="absolute left-3 top-1/2 -translate-y-1/2 text-sm"
        style={{ color: 'var(--subtle)' }}
      >
        $
      </span>
      <input
        type="number"
        min="0"
        step="0.01"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full pl-6 pr-3 py-2.5 rounded-xl text-sm border tabular-nums"
        style={{
          background: 'var(--surface-muted)',
          borderColor: 'var(--border)',
          color: 'var(--ink)',
          outline: 'none',
        }}
      />
    </div>
  );
}

function StepDot({
  active,
  done,
  label,
}: {
  active: boolean;
  done: boolean;
  label: string;
}) {
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <div
        className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-semibold shrink-0"
        style={{
          background: done
            ? 'var(--success)'
            : active
            ? 'var(--accent)'
            : 'var(--border)',
          color: done || active ? '#fff' : 'var(--muted)',
        }}
      >
        {done ? '✓' : '·'}
      </div>
      <span style={{ color: active ? 'var(--ink)' : 'var(--muted)' }}>{label}</span>
    </div>
  );
}
