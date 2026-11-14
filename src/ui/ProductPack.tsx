import { getProduct } from '../domain/seed'
import { cx } from './primitives'

/** Neutral, invented pack illustration — no real brand artwork. */
export function ProductPack({ sku, size = 56, className }: { sku: string; size?: number; className?: string }) {
  const p = getProduct(sku)
  const t = p.tint
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      aria-hidden
      className={cx('shrink-0 rounded-lg', className)}
      style={{ background: `color-mix(in srgb, ${t} 12%, white)` }}
    >
      {p.category === 'oral' && (
        <g>
          <rect x="25" y="9" width="14" height="7" rx="2" fill="#1c1917" opacity="0.85" />
          <path d="M22 18c0-2 1.5-3 3-3h14c1.5 0 3 1 3 3v34c0 2.2-1.8 4-4 4H26c-2.2 0-4-1.8-4-4z" fill={t} />
          <rect x="25" y="28" width="14" height="14" rx="2" fill="white" opacity="0.9" />
          <rect x="28" y="32" width="8" height="1.6" rx="0.8" fill="#1c1917" opacity="0.6" />
          <rect x="28" y="36" width="5" height="1.6" rx="0.8" fill="#1c1917" opacity="0.35" />
        </g>
      )}
      {(p.category === 'skin' || p.category === 'sun') && (
        <g>
          <path d="M19 12h26l-3 34H22z" fill={t} />
          <rect x="24" y="46" width="16" height="8" rx="2" fill="#1c1917" opacity="0.85" />
          <rect x="24" y="20" width="16" height="12" rx="2" fill="white" opacity="0.9" />
          <rect x="27" y="24" width="10" height="1.6" rx="0.8" fill="#1c1917" opacity="0.6" />
          <rect x="27" y="27.5" width="6" height="1.6" rx="0.8" fill="#1c1917" opacity="0.35" />
          {p.category === 'sun' && <circle cx="32" cy="38" r="3" fill="white" opacity="0.85" />}
        </g>
      )}
      {p.category === 'lips' && (
        <g>
          <rect x="26" y="10" width="12" height="12" rx="5" fill="#1c1917" opacity="0.85" />
          <rect x="25" y="22" width="14" height="32" rx="3" fill={t} />
          <rect x="27.5" y="30" width="9" height="12" rx="1.5" fill="white" opacity="0.9" />
        </g>
      )}
      {p.category === 'hygiene' && (
        <g>
          <rect x="12" y="20" width="40" height="26" rx="6" fill={t} />
          <rect x="24" y="24" width="16" height="6" rx="3" fill="white" opacity="0.9" />
          <rect x="18" y="35" width="28" height="2" rx="1" fill="white" opacity="0.6" />
          <rect x="18" y="39" width="18" height="2" rx="1" fill="white" opacity="0.45" />
        </g>
      )}
    </svg>
  )
}
