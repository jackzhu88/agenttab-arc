import { ConnectKitButton } from 'connectkit';
import { TokenUSDC } from '@web3icons/react';

export function Header() {
  return (
    <header
      className="sticky top-0 z-50 border-b"
      style={{
        background: 'var(--surface-strong)',
        borderColor: 'var(--border)',
        backdropFilter: 'blur(16px)',
      }}
    >
      <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div
            className="flex items-center justify-center w-8 h-8 rounded-lg"
            style={{ background: 'var(--accent)' }}
          >
            <TokenUSDC variant="mono" size={18} style={{ filter: 'brightness(10)' }} />
          </div>
          <div>
            <h1
              className="display text-base font-semibold leading-tight"
              style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}
            >
              AgentTab
            </h1>
            <p className="text-xs leading-none" style={{ color: 'var(--muted)' }}>
              USDC pay-per-call on Arc
            </p>
          </div>
        </div>
        <ConnectKitButton />
      </div>
    </header>
  );
}
