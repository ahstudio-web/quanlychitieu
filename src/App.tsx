/**
 * Budget Tracker — Arc USDC
 * Manage spending categories, log USDC expenses, and pay on Arc Testnet.
 * Built with Arc Studio — https://studio.arc.io
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import { ConnectKitButton } from 'connectkit'
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
  useSwitchChain,
} from 'wagmi'
import { erc20Abi, isAddress } from 'viem'
import { AnimatePresence, motion } from 'framer-motion'
import {
  PlusCircle,
  Wallet,
  TrendingDown,
  ArrowUpRight,
  X,
  ExternalLink,
  Loader2,
  ShoppingCart,
  Coffee,
  Home,
  Car,
  Zap,
  Heart,
  BookOpen,
  MoreHorizontal,
  Send,
  Droplets,
  CheckCircle2,
} from 'lucide-react'
import { TokenUSDC } from '@web3icons/react'
import { toast } from 'sonner'
import { arcTestnet } from 'viem/chains'
import { getUsdc, buildTxExplorerUrl } from '@/onchain-facts'
import { Amount, usdcDecimalsFor, parseAmount } from '@/onchain-money'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CHAIN_ID = arcTestnet.id
const USDC = getUsdc(CHAIN_ID)!
const USDC_DECIMALS = usdcDecimalsFor(CHAIN_ID)

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CategoryId =
  | 'food'
  | 'housing'
  | 'transport'
  | 'utilities'
  | 'health'
  | 'education'
  | 'shopping'
  | 'other'

interface Category {
  id: CategoryId
  label: string
  icon: React.ReactNode
  color: string
  budget: number // USDC
}

interface Expense {
  id: string
  categoryId: CategoryId
  description: string
  amount: number // USDC raw float
  recipient: string
  txHash?: string
  timestamp: number
}

// ---------------------------------------------------------------------------
// Initial data
// ---------------------------------------------------------------------------

const CATEGORIES: Category[] = [
  { id: 'food', label: 'Ăn uống', icon: <Coffee className="size-4" />, color: '#e8734a', budget: 200 },
  { id: 'housing', label: 'Nhà ở', icon: <Home className="size-4" />, color: '#1061a6', budget: 800 },
  { id: 'transport', label: 'Di chuyển', icon: <Car className="size-4" />, color: '#6c47c9', budget: 150 },
  { id: 'utilities', label: 'Tiện ích', icon: <Zap className="size-4" />, color: '#d4a017', budget: 100 },
  { id: 'health', label: 'Sức khỏe', icon: <Heart className="size-4" />, color: '#ba2b4c', budget: 100 },
  { id: 'education', label: 'Học tập', icon: <BookOpen className="size-4" />, color: '#1a8047', budget: 150 },
  { id: 'shopping', label: 'Mua sắm', icon: <ShoppingCart className="size-4" />, color: '#0e7490', budget: 200 },
  { id: 'other', label: 'Khác', icon: <MoreHorizontal className="size-4" />, color: '#8a849c', budget: 100 },
]

const TOTAL_BUDGET = CATEGORIES.reduce((s, c) => s + c.budget, 0)

// Quick-amount presets for Send Money (testnet-friendly)
const QUICK_AMOUNTS = [0.1, 0.5, 1, 5] as const

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const springs = {
  sheet: { type: 'spring', stiffness: 400, damping: 40 },
  pop: { type: 'spring', stiffness: 500, damping: 35 },
}

const glass = {
  card: {
    background: 'var(--surface-strong)',
    backdropFilter: 'blur(20px) saturate(180%)',
    WebkitBackdropFilter: 'blur(20px) saturate(180%)',
    border: '1px solid var(--border)',
    borderRadius: '20px',
  } as React.CSSProperties,
  inner: {
    background: 'var(--surface-muted)',
    borderRadius: '12px',
    border: '1px solid var(--border)',
  } as React.CSSProperties,
}

function formatUsdc(n: number) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(n)
}

function shortAddr(a: string) {
  return a.slice(0, 6) + '...' + a.slice(-4)
}

function parseOnchainError(err: unknown) {
  const msg = (err as Error)?.message?.toLowerCase() ?? ''
  if (msg.includes('user rejected') || msg.includes('denied')) return 'Bạn đã từ chối giao dịch.'
  if (msg.includes('insufficient')) return 'Số dư không đủ. Vui lòng nạp thêm USDC.'
  if (msg.includes('reverted')) return 'Giao dịch thất bại. Vui lòng thử lại.'
  return 'Đã xảy ra lỗi. Vui lòng thử lại.'
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

function useUsdcBalance(address: `0x${string}` | undefined) {
  const { data, isLoading, refetch } = useReadContract({
    address: USDC.address as `0x${string}`,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [address ?? '0x0000000000000000000000000000000000000000'],
    chainId: CHAIN_ID,
    query: { enabled: !!address, refetchInterval: 10_000 },
  })
  const formatted = data ? Amount.fromRaw(data, USDC_DECIMALS).toFixed(2) : null
  return { raw: data, formatted, isLoading, refetch }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function CategoryBar({ cat, spent }: { cat: Category; spent: number }) {
  const pct = Math.min((spent / cat.budget) * 100, 100)
  const over = spent > cat.budget
  return (
    <div className="flex items-center gap-3 py-2">
      <div
        className="flex size-8 shrink-0 items-center justify-center rounded-xl"
        style={{ background: cat.color + '1a', color: cat.color }}
      >
        {cat.icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
            {cat.label}
          </span>
          <span className="mono text-xs tabular-nums" style={{ color: over ? 'var(--danger)' : 'var(--muted)' }}>
            {formatUsdc(spent)} / {formatUsdc(cat.budget)}
          </span>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--border)' }}>
          <motion.div
            className="h-full rounded-full"
            style={{ background: over ? 'var(--danger)' : cat.color }}
            initial={{ width: 0 }}
            animate={{ width: pct + '%' }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          />
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// SendMoneySheet
// ---------------------------------------------------------------------------

interface SendMoneySheetProps {
  open: boolean
  onClose: () => void
  onSent?: (txHash: string, to: string, amount: number) => void
}

function SendMoneySheet({ open, onClose, onSent }: SendMoneySheetProps) {
  const { address, chainId } = useAccount()
  const { switchChain } = useSwitchChain()
  const { writeContract, data: txHash, isPending, error: writeError, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash })
  const { formatted: balFmt, raw: balRaw, refetch } = useUsdcBalance(address)

  const [amount, setAmount] = useState('')
  const [recipient, setRecipient] = useState('')
  const [memo, setMemo] = useState('')
  const confirmedRef = useRef(false)

  const wrongChain = !!address && chainId !== CHAIN_ID
  const amountNum = parseFloat(amount) || 0
  const recipientValid = isAddress(recipient)
  const ready = !!address && !wrongChain && amountNum > 0 && recipientValid

  const handleSend = useCallback(() => {
    if (wrongChain) { switchChain({ chainId: CHAIN_ID }); return }
    if (!ready) return
    try {
      const parsed = parseAmount(CHAIN_ID, amount)
      writeContract({
        address: USDC.address as `0x${string}`,
        abi: erc20Abi,
        functionName: 'transfer',
        args: [recipient, parsed.raw],
        chainId: CHAIN_ID,
      })
    } catch (e) {
      toast.error(parseOnchainError(e))
    }
  }, [wrongChain, ready, amount, recipient, switchChain, writeContract])

  useEffect(() => {
    if (isSuccess && txHash && !confirmedRef.current) {
      confirmedRef.current = true
      void refetch()
      onSent?.(txHash, recipient, amountNum)
      toast.success(`Đã gửi ${amountNum} USDC thành công!`)
      setTimeout(() => {
        setAmount(''); setRecipient(''); setMemo('')
        reset()
        onClose()
      }, 1400)
    }
  }, [isSuccess, txHash, onSent, recipient, amountNum, refetch, reset, onClose])

  useEffect(() => { if (!isSuccess) confirmedRef.current = false }, [isSuccess])

  useEffect(() => {
    if (writeError) { toast.error(parseOnchainError(writeError)); reset() }
  }, [writeError, reset])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" />
          <motion.section
            className="relative w-full max-w-md overflow-hidden rounded-t-3xl"
            style={{ background: 'rgba(255,255,255,0.96)', backdropFilter: 'blur(40px) saturate(200%)', WebkitBackdropFilter: 'blur(40px) saturate(200%)' }}
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={springs.sheet}
            onClick={(e) => e.stopPropagation()}
          >
            {/* spectral strip */}
            <div className="h-1 w-full" style={{ background: 'linear-gradient(90deg,#60a5fa,#34d399,#a78bfa)' }} />
            <div className="flex justify-center pt-3 pb-1">
              <div className="h-1 w-10 rounded-full bg-black/10" />
            </div>

            <div className="px-5 pb-8 pt-2">
              <div className="mb-5 flex items-center justify-between">
                <h2 className="display text-lg font-semibold" style={{ color: 'var(--ink)' }}>Gửi USDC</h2>
                <button onClick={onClose} className="flex size-8 items-center justify-center rounded-full transition-colors hover:bg-black/5" style={{ color: 'var(--subtle)' }}>
                  <X className="size-4" />
                </button>
              </div>

              {/* Amount big input */}
              <div className="mb-3 rounded-2xl px-4 py-4" style={glass.inner}>
                <div className="flex items-center gap-3">
                  <TokenUSDC variant="branded" size={32} />
                  <input
                    inputMode="decimal"
                    className="display min-w-0 flex-1 bg-transparent text-4xl font-bold tabular-nums outline-none placeholder:text-slate-200"
                    style={{ color: 'var(--ink)' }}
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => {
                      const v = e.target.value.replace(/[^0-9.]/g, '')
                      if (v === '' || /^\d*\.?\d*$/.test(v)) setAmount(v)
                    }}
                  />
                  <span className="text-sm font-semibold" style={{ color: 'var(--subtle)' }}>USDC</span>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <div className="flex gap-1.5">
                    {QUICK_AMOUNTS.map((q) => (
                      <button
                        key={q}
                        onClick={() => setAmount(String(q))}
                        className="rounded-lg px-2.5 py-1 text-xs font-semibold transition-all"
                        style={
                          amountNum === q
                            ? { background: 'var(--accent)', color: '#fff' }
                            : { background: 'var(--border)', color: 'var(--ink-2)' }
                        }
                      >
                        ${q}
                      </button>
                    ))}
                  </div>
                  {address && (
                    <button
                      disabled={!balRaw}
                      className="text-xs font-semibold disabled:opacity-40"
                      style={{ color: 'var(--accent-hover)' }}
                      onClick={() => { if (balRaw) setAmount(Amount.fromRaw(balRaw, USDC_DECIMALS).toFixed(6)) }}
                    >
                      {balFmt ? `${balFmt} · Max` : '···'}
                    </button>
                  )}
                </div>
              </div>

              {/* Recipient */}
              <div className="mb-3 rounded-xl px-4 py-3" style={glass.inner}>
                <label className="mb-1 block text-xs font-semibold" style={{ color: 'var(--muted)' }}>Địa chỉ nhận</label>
                <input
                  className="mono w-full bg-transparent text-xs outline-none placeholder:text-slate-300"
                  style={{ color: recipientValid && recipient ? 'var(--success)' : 'var(--ink)' }}
                  placeholder="0x..."
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value.trim())}
                />
                {recipient && !recipientValid && (
                  <p className="mt-1 text-xs" style={{ color: 'var(--danger)' }}>Địa chỉ không hợp lệ</p>
                )}
              </div>

              {/* Memo (optional) */}
              <div className="mb-5 rounded-xl px-4 py-3" style={glass.inner}>
                <label className="mb-1 block text-xs font-semibold" style={{ color: 'var(--muted)' }}>Ghi chú (tuỳ chọn)</label>
                <input
                  className="w-full bg-transparent text-sm outline-none placeholder:text-slate-300"
                  style={{ color: 'var(--ink)' }}
                  placeholder="Ví dụ: Chia tiền ăn trưa"
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                />
              </div>

              {!address ? (
                <div className="flex justify-center"><ConnectKitButton /></div>
              ) : (
                <button
                  disabled={!ready || isPending || isConfirming}
                  onClick={handleSend}
                  className="w-full rounded-2xl py-3.5 text-sm font-semibold text-white transition-all hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
                  style={{ background: 'var(--accent)' }}
                >
                  {wrongChain ? 'Chuyển sang Arc Testnet'
                    : isPending ? <span className="flex items-center justify-center gap-2"><Loader2 className="size-4 animate-spin" />Xác nhận trong ví...</span>
                    : isConfirming ? <span className="flex items-center justify-center gap-2"><Loader2 className="size-4 animate-spin" />Đang xác nhận...</span>
                    : isSuccess ? <span className="flex items-center justify-center gap-2"><CheckCircle2 className="size-4" />Thành công!</span>
                    : <span className="flex items-center justify-center gap-2"><Send className="size-4" />Gửi {amountNum > 0 ? `${amountNum} USDC` : 'USDC'}</span>}
                </button>
              )}

              {txHash && (
                <a href={buildTxExplorerUrl(CHAIN_ID, txHash)} target="_blank" rel="noreferrer"
                  className="mt-3 flex items-center justify-center gap-1 text-xs" style={{ color: 'var(--accent-hover)' }}>
                  Xem giao dịch <ExternalLink className="size-3" />
                </a>
              )}
            </div>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ---------------------------------------------------------------------------
// FaucetButton — calls Circle testnet faucet for Arc Testnet USDC
// ---------------------------------------------------------------------------

function FaucetButton({ onDripped }: { onDripped?: () => void }) {
  const { address } = useAccount()
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  const handleFaucet = useCallback(async () => {
    if (!address) { toast.error('Kết nối ví trước.'); return }
    setLoading(true)
    try {
      const res = await fetch('https://faucet.circle.com/api/faucet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, blockchain: 'ARC-TESTNET', usdc: true, native: false, eurc: false }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { message?: string }
        const msg: string = body.message ?? 'Faucet tạm thời không hoạt động. Thử lại sau.'
        if (msg.toLowerCase().includes('rate limit') || msg.toLowerCase().includes('already')) {
          toast.error('Bạn đã nhận USDC gần đây. Vui lòng chờ 24h trước khi thử lại.')
        } else {
          toast.error(msg)
        }
        return
      }
      setDone(true)
      toast.success('USDC testnet đang chuyển đến ví của bạn!')
      onDripped?.()
      setTimeout(() => setDone(false), 6000)
    } catch {
      toast.error('Không thể kết nối đến faucet. Vui lòng thử lại.')
    } finally {
      setLoading(false)
    }
  }, [address, onDripped])

  return (
    <motion.button
      whileHover={{ scale: address ? 1.03 : 1 }}
      whileTap={{ scale: address ? 0.97 : 1 }}
      disabled={loading || done || !address}
      onClick={() => { void handleFaucet() }}
      className="flex items-center gap-2 rounded-2xl px-4 py-2.5 text-xs font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-50"
      style={done
        ? { background: 'rgba(26,128,71,0.12)', color: 'var(--success)', border: '1px solid rgba(26,128,71,0.2)' }
        : { background: 'rgba(16,97,166,0.08)', color: 'var(--accent-hover)', border: '1px solid rgba(16,97,166,0.15)' }}
    >
      {loading
        ? <><Loader2 className="size-3.5 animate-spin" />Đang nhận...</>
        : done
        ? <><CheckCircle2 className="size-3.5" />Đã nhận USDC!</>
        : <><Droplets className="size-3.5" />Nhận USDC test</>}
    </motion.button>
  )
}

// ---------------------------------------------------------------------------
// AddExpenseSheet
// ---------------------------------------------------------------------------

interface AddExpenseSheetProps {
  open: boolean
  onClose: () => void
  onAdd: (exp: Omit<Expense, 'id' | 'timestamp'>) => void
}

function AddExpenseSheet({ open, onClose, onAdd }: AddExpenseSheetProps) {
  const { address, chainId } = useAccount()
  const { switchChain } = useSwitchChain()
  const { writeContract, data: txHash, isPending, error: writeError, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash })
  const { formatted: balFmt, raw: balRaw, refetch } = useUsdcBalance(address)

  const [catId, setCatId] = useState<CategoryId>('food')
  const [desc, setDesc] = useState('')
  const [amount, setAmount] = useState('')
  const [recipient, setRecipient] = useState('')
  const confirmedRef = useRef(false)

  const wrongChain = !!address && chainId !== CHAIN_ID
  const amountNum = parseFloat(amount) || 0
  const ready =
    !!address &&
    !wrongChain &&
    amountNum > 0 &&
    recipient.startsWith('0x') &&
    recipient.length === 42 &&
    desc.trim().length > 0

  const handleSend = useCallback(() => {
    if (wrongChain) { switchChain({ chainId: CHAIN_ID }); return }
    if (!ready) return
    try {
      const parsed = parseAmount(CHAIN_ID, amount)
      writeContract({
        address: USDC.address as `0x${string}`,
        abi: erc20Abi,
        functionName: 'transfer',
        args: [recipient as `0x${string}`, parsed.raw],
        chainId: CHAIN_ID,
      })
    } catch (e) {
      toast.error(parseOnchainError(e))
    }
  }, [wrongChain, ready, amount, recipient, switchChain, writeContract])

  // When confirmed, save the expense
  const handleConfirmed = useCallback(() => {
    onAdd({ categoryId: catId, description: desc, amount: amountNum, recipient, txHash })
    void refetch()
    // reset state
    setDesc(''); setAmount(''); setRecipient('')
    reset()
    toast.success('Chi tiêu đã được ghi nhận!')
    setTimeout(onClose, 1200)
  }, [onAdd, catId, desc, amountNum, recipient, txHash, refetch, reset, onClose])

  // Watch for success (effect so it only fires once per confirmation)
  useEffect(() => {
    if (isSuccess && txHash && !confirmedRef.current) {
      confirmedRef.current = true
      handleConfirmed()
    }
  }, [isSuccess, txHash, handleConfirmed])

  // Reset confirmed guard when sheet reopens
  useEffect(() => {
    if (!isSuccess) confirmedRef.current = false
  }, [isSuccess])

  useEffect(() => {
    if (writeError) {
      toast.error(parseOnchainError(writeError))
      reset()
    }
  }, [writeError, reset])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" />
          <motion.section
            className="relative w-full max-w-md overflow-hidden rounded-t-3xl"
            style={{
              background: 'rgba(255,255,255,0.94)',
              backdropFilter: 'blur(40px) saturate(200%)',
              WebkitBackdropFilter: 'blur(40px) saturate(200%)',
            }}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={springs.sheet}
            onClick={(e) => e.stopPropagation()}
          >
            {/* spectral strip */}
            <div
              className="h-1 w-full"
              style={{
                background:
                  'linear-gradient(90deg,#f87171,#fb923c,#fbbf24,#34d399,#60a5fa,#a78bfa)',
              }}
            />

            {/* drag handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="h-1 w-10 rounded-full bg-black/10" />
            </div>

            <div className="px-5 pb-8 pt-2">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="display text-lg font-semibold" style={{ color: 'var(--ink)' }}>
                  Thêm chi tiêu
                </h2>
                <button
                  onClick={onClose}
                  className="flex size-8 items-center justify-center rounded-full transition-colors hover:bg-black/5"
                  style={{ color: 'var(--subtle)' }}
                >
                  <X className="size-4" />
                </button>
              </div>

              {/* Category chips */}
              <div className="mb-4 flex flex-wrap gap-2">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setCatId(cat.id)}
                    className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all"
                    style={
                      catId === cat.id
                        ? { background: cat.color, color: '#fff' }
                        : { background: cat.color + '18', color: cat.color }
                    }
                  >
                    {cat.icon}
                    {cat.label}
                  </button>
                ))}
              </div>

              {/* Description */}
              <div className="mb-3 rounded-xl px-4 py-3" style={glass.inner}>
                <label className="mb-1 block text-xs font-semibold" style={{ color: 'var(--muted)' }}>
                  Mô tả
                </label>
                <input
                  className="w-full bg-transparent text-sm outline-none placeholder:text-slate-300"
                  style={{ color: 'var(--ink)' }}
                  placeholder="Ví dụ: Bữa trưa với đồng nghiệp"
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                />
              </div>

              {/* Amount */}
              <div className="mb-3 rounded-xl px-4 py-3" style={glass.inner}>
                <label className="mb-1 block text-xs font-semibold" style={{ color: 'var(--muted)' }}>
                  Số tiền (USDC)
                </label>
                <div className="flex items-baseline gap-2">
                  <input
                    inputMode="decimal"
                    className="display w-full bg-transparent text-3xl font-bold tabular-nums outline-none placeholder:text-slate-200"
                    style={{ color: 'var(--ink)' }}
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => {
                      const v = e.target.value.replace(/[^0-9.]/g, '')
                      if (v === '' || /^\d*\.?\d*$/.test(v)) setAmount(v)
                    }}
                  />
                  <span className="text-sm font-medium" style={{ color: 'var(--subtle)' }}>USDC</span>
                </div>
                {address && (
                  <button
                    disabled={!balRaw}
                    className="mt-1 text-xs font-semibold disabled:opacity-40"
                    style={{ color: 'var(--accent-hover)' }}
                    onClick={() => {
                      if (balRaw) {
                        setAmount(Amount.fromRaw(balRaw, USDC_DECIMALS).toFixed(6))
                      }
                    }}
                  >
                    {balFmt ? `Số dư: ${balFmt} · Tối đa` : 'Đang tải số dư...'}
                  </button>
                )}
              </div>

              {/* Recipient */}
              <div className="mb-5 rounded-xl px-4 py-3" style={glass.inner}>
                <label className="mb-1 block text-xs font-semibold" style={{ color: 'var(--muted)' }}>
                  Địa chỉ nhận (0x...)
                </label>
                <input
                  className="mono w-full bg-transparent text-xs outline-none placeholder:text-slate-300"
                  style={{ color: 'var(--ink)' }}
                  placeholder="0x..."
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                />
              </div>

              {/* CTA */}
              {!address ? (
                <div className="flex justify-center">
                  <ConnectKitButton />
                </div>
              ) : (
                <button
                  disabled={!ready || isPending || isConfirming}
                  onClick={handleSend}
                  className="w-full rounded-2xl py-3.5 text-sm font-semibold text-white transition-all hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
                  style={{ background: 'var(--accent)' }}
                >
                  {wrongChain ? (
                    'Chuyển sang Arc Testnet'
                  ) : isPending ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="size-4 animate-spin" /> Xác nhận trong ví...
                    </span>
                  ) : isConfirming ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="size-4 animate-spin" /> Đang xác nhận...
                    </span>
                  ) : isSuccess ? (
                    'Thành công!'
                  ) : (
                    <span className="flex items-center gap-2">
                      <ArrowUpRight className="size-4" />
                      Thanh toán {amountNum > 0 ? formatUsdc(amountNum) : ''} USDC
                    </span>
                  )}
                </button>
              )}

              {txHash && (
                <a
                  href={buildTxExplorerUrl(CHAIN_ID, txHash)}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 flex items-center justify-center gap-1 text-xs"
                  style={{ color: 'var(--accent-hover)' }}
                >
                  Xem giao dịch <ExternalLink className="size-3" />
                </a>
              )}
            </div>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ---------------------------------------------------------------------------
// Main App
// ---------------------------------------------------------------------------

export default function App() {
  const { address, chainId } = useAccount()
  const { formatted: balFmt, isLoading: balLoading } = useUsdcBalance(address)

  const [expenses, setExpenses] = useState<Expense[]>([])
  const [sheetOpen, setSheetOpen] = useState(false)
  const [sendOpen, setSendOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<'overview' | 'history' | 'send'>('overview')
  const { refetch: refetchBalance } = useUsdcBalance(address)

  const wrongChain = !!address && chainId !== CHAIN_ID

  const addExpense = useCallback((exp: Omit<Expense, 'id' | 'timestamp'>) => {
    setExpenses((prev) => [
      { ...exp, id: Math.random().toString(36).slice(2), timestamp: Date.now() },
      ...prev,
    ])
  }, [])

  // Spend by category
  const spentByCategory = Object.fromEntries(
    CATEGORIES.map((cat) => [
      cat.id,
      expenses.filter((e) => e.categoryId === cat.id).reduce((s, e) => s + e.amount, 0),
    ]),
  ) as Record<CategoryId, number>

  const totalSpent = expenses.reduce((s, e) => s + e.amount, 0)
  const remaining = TOTAL_BUDGET - totalSpent
  const spentPct = Math.min((totalSpent / TOTAL_BUDGET) * 100, 100)

  return (
    <div className="min-h-dvh" style={{ background: 'var(--bg-gradient)' }}>
      {/* Header */}
      <header className="sticky top-0 z-10 flex items-center justify-between px-4 py-4"
        style={{ background: 'rgba(249,249,252,0.82)', backdropFilter: 'blur(20px)', borderBottom: '1px solid var(--border)' }}>
        <div>
          <p className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--muted)' }}>
            Arc Testnet
          </p>
          <h1 className="display text-xl font-bold" style={{ color: 'var(--ink)', letterSpacing: '-0.03em' }}>
            Quản lý chi tiêu
          </h1>
        </div>
        <ConnectKitButton.Custom>
          {({ isConnected, show, address: addr }) => (
            <button
              onClick={show}
              className="flex items-center gap-2 rounded-2xl px-3 py-2 text-xs font-semibold transition-colors"
              style={
                isConnected
                  ? { background: 'var(--surface-muted)', color: 'var(--ink)', border: '1px solid var(--border)' }
                  : { background: 'var(--accent)', color: '#fff' }
              }
            >
              <Wallet className="size-3.5" />
              {isConnected && addr ? shortAddr(addr) : 'Kết nối ví'}
            </button>
          )}
        </ConnectKitButton.Custom>
      </header>

      <main className="mx-auto max-w-md px-4 pb-32 pt-5">
        {/* Wrong chain banner */}
        <AnimatePresence>
          {wrongChain && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="mb-4 rounded-2xl px-4 py-3 text-sm font-medium"
              style={{ background: '#fff3cd', color: '#856404', border: '1px solid #ffc107' }}
            >
              Vui lòng chuyển sang Arc Testnet để thanh toán USDC.
            </motion.div>
          )}
        </AnimatePresence>

        {/* Hero balance card */}
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="mb-4 p-5"
          style={glass.card}
        >
          <div className="mb-3 flex items-center gap-1.5">
            <div className="flex size-5 items-center justify-center rounded-md" style={{ background: 'rgba(16,97,166,0.1)' }}>
              <Wallet className="size-3" style={{ color: 'var(--accent-hover)' }} />
            </div>
            <span className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>
              Số dư USDC
            </span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="display text-4xl font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
              {address ? (balLoading ? '···' : (balFmt ?? '0.00')) : '—'}
            </span>
            <span className="text-lg font-medium" style={{ color: 'var(--subtle)' }}>USDC</span>
          </div>
          <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
            {address ? 'Arc Testnet · Cập nhật mỗi 10 giây' : 'Kết nối ví để xem số dư thực'}
          </p>

          {/* action row */}
          <div className="mt-4 flex items-center gap-2">
            <motion.button
              whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
              onClick={() => { setActiveTab('send'); setSendOpen(true) }}
              disabled={!address}
              className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
              style={{ background: 'var(--accent)' }}
            >
              <Send className="size-3.5" /> Gửi tiền
            </motion.button>
            <FaucetButton onDripped={() => { void refetchBalance() }} />
          </div>
        </motion.section>

        {/* Budget summary */}
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-4 p-5"
          style={glass.card}
        >
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <div className="flex size-5 items-center justify-center rounded-md" style={{ background: 'rgba(186,43,76,0.1)' }}>
                <TrendingDown className="size-3" style={{ color: 'var(--danger)' }} />
              </div>
              <span className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>
                Ngân sách tháng này
              </span>
            </div>
            <span className="mono text-xs tabular-nums" style={{ color: 'var(--muted)' }}>
              Còn lại {formatUsdc(remaining)}
            </span>
          </div>

          {/* big spend number */}
          <div className="flex items-baseline gap-1 mb-3">
            <span className="display text-3xl font-bold tabular-nums" style={{ color: remaining < 0 ? 'var(--danger)' : 'var(--ink)' }}>
              {formatUsdc(totalSpent)}
            </span>
            <span className="text-sm" style={{ color: 'var(--subtle)' }}>/ {formatUsdc(TOTAL_BUDGET)}</span>
          </div>

          {/* overall bar */}
          <div className="h-2 overflow-hidden rounded-full" style={{ background: 'var(--border)' }}>
            <motion.div
              className="h-full rounded-full"
              style={{ background: spentPct > 90 ? 'var(--danger)' : 'var(--accent-hover)' }}
              initial={{ width: 0 }}
              animate={{ width: spentPct + '%' }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
            />
          </div>
          <p className="mt-1.5 text-right text-xs tabular-nums" style={{ color: 'var(--muted)' }}>
            {spentPct.toFixed(1)}% đã dùng
          </p>
        </motion.section>

        {/* Tabs */}
        <div className="mb-4 flex gap-1 rounded-2xl p-1" style={glass.inner}>
          {([
            { id: 'overview', label: 'Tổng quan' },
            { id: 'history', label: 'Lịch sử' },
            { id: 'send', label: 'Gửi tiền' },
          ] as const).map((tab) => (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); if (tab.id === 'send') setSendOpen(true) }}
              className="flex-1 rounded-xl py-2 text-xs font-semibold transition-all"
              style={
                activeTab === tab.id
                  ? { background: 'var(--accent)', color: '#fff' }
                  : { color: 'var(--muted)' }
              }
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <AnimatePresence mode="wait">
          {activeTab === 'send' ? (
            <motion.div
              key="send"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.18 }}
            >
              <div className="rounded-2xl p-5 text-center" style={glass.card}>
                <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl"
                  style={{ background: 'rgba(16,97,166,0.08)' }}>
                  <Send className="size-6" style={{ color: 'var(--accent-hover)' }} />
                </div>
                <h3 className="display text-base font-semibold" style={{ color: 'var(--ink)' }}>
                  Gửi USDC đến bất kỳ ai
                </h3>
                <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
                  Chuyển tiền nhanh chóng, phí thấp trên Arc Testnet
                </p>
                <motion.button
                  whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                  onClick={() => setSendOpen(true)}
                  disabled={!address}
                  className="mt-5 w-full rounded-2xl py-3.5 text-sm font-semibold text-white disabled:opacity-40"
                  style={{ background: 'var(--accent)' }}
                >
                  <span className="flex items-center justify-center gap-2">
                    <Send className="size-4" /> Mở form gửi tiền
                  </span>
                </motion.button>
                {!address && (
                  <p className="mt-3 text-xs" style={{ color: 'var(--subtle)' }}>Kết nối ví để gửi tiền</p>
                )}
              </div>
            </motion.div>
          ) : activeTab === 'overview' ? (
            <motion.div
              key="overview"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.18 }}
            >
              <div className="rounded-2xl p-4" style={glass.card}>
                <h2 className="mb-1 text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--muted)' }}>
                  Theo danh mục
                </h2>
                <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                  {CATEGORIES.map((cat) => (
                    <CategoryBar key={cat.id} cat={cat} spent={spentByCategory[cat.id]} />
                  ))}
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="history"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ duration: 0.18 }}
            >
              <div className="rounded-2xl p-4" style={glass.card}>
                <h2 className="mb-3 text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--muted)' }}>
                  Giao dịch gần đây
                </h2>
                {expenses.length === 0 ? (
                  <div className="py-12 text-center">
                    <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-2xl"
                      style={{ background: 'var(--surface-muted)' }}>
                      <TrendingDown className="size-6" style={{ color: 'var(--subtle)' }} />
                    </div>
                    <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
                      Chưa có chi tiêu nào
                    </p>
                    <p className="mt-1 text-xs" style={{ color: 'var(--subtle)' }}>
                      Thêm chi tiêu đầu tiên để bắt đầu theo dõi
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {expenses.map((exp) => {
                      const cat = CATEGORIES.find((c) => c.id === exp.categoryId)!
                      return (
                        <div key={exp.id} className="flex items-center gap-3 rounded-xl px-3 py-2.5"
                          style={{ background: 'var(--surface-muted)' }}>
                          <div
                            className="flex size-8 shrink-0 items-center justify-center rounded-xl"
                            style={{ background: cat.color + '1a', color: cat.color }}
                          >
                            {cat.icon}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium" style={{ color: 'var(--ink)' }}>
                              {exp.description}
                            </p>
                            <p className="text-xs" style={{ color: 'var(--muted)' }}>
                              {cat.label} · {new Date(exp.timestamp).toLocaleDateString('vi-VN')}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="mono text-sm font-semibold tabular-nums" style={{ color: 'var(--danger)' }}>
                              -{formatUsdc(exp.amount)}
                            </p>
                            {exp.txHash && (
                              <a
                                href={buildTxExplorerUrl(CHAIN_ID, exp.txHash)}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center justify-end gap-0.5 text-xs"
                                style={{ color: 'var(--accent-hover)' }}
                              >
                                Tx <ExternalLink className="size-2.5" />
                              </a>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* FAB */}
      <div className="fixed bottom-20 right-0 left-0 z-20 flex justify-center px-4">
        <motion.button
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => setSheetOpen(true)}
          className="flex items-center gap-2 rounded-2xl px-6 py-3.5 text-sm font-semibold text-white shadow-lg"
          style={{ background: 'var(--accent)' }}
        >
          <PlusCircle className="size-4" />
          Thêm chi tiêu
        </motion.button>
      </div>

      {/* Add expense bottom sheet */}
      <AddExpenseSheet open={sheetOpen} onClose={() => setSheetOpen(false)} onAdd={addExpense} />

      {/* Send money bottom sheet */}
      <SendMoneySheet
        open={sendOpen}
        onClose={() => { setSendOpen(false); setActiveTab('overview') }}
        onSent={(txHash, to, amt) => {
          addExpense({ categoryId: 'other', description: `Gửi tiền → ${to.slice(0, 8)}...`, amount: amt, recipient: to, txHash })
        }}
      />
    </div>
  )
}
