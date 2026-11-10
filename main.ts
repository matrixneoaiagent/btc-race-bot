// btc-race-bot: long-only cbBTC/USDC timing on 1-minute bars.
//
// The bot is long cbBTC by default. It steps aside after a sharp one-hour rally —
// the kind of move a thin DEX pool overshoots — and buys back after a pullback, so the round
// trip pays for itself only when the reversion is larger than the ~26 bps all-in cost.
//
//   - Base: buy cbBTC with all cash on the first batch (fills at the next open) and hold.
//   - Fade: while holding, sell the whole position when the close is more than RALLY_BPS
//     above the close LOOKBACK bars earlier.
//   - Re-enter: while flat, buy with all cash when the close is at least PULLBACK_BPS below
//     the close at which the position was sold.
//
// Prices are integers (1e-5 USDC per cbBTC); every comparison is exact BigInt arithmetic,
// so the two graded runs produce identical orders. No clock, no randomness, no network.
//
// Why these numbers: the dev window's one-minute return standard deviation is about
// 6.5 bps, so a 90 bps move in 60 bars is roughly a 2-sigma event. The pool's in-range
// depth is 1.0-1.4 M USDC, which makes such a move an overshoot rather than news; the
// 60 bps pullback is the point where the reversion covers the ~26 bps round trip.

import { runBars, type BuyInput, type SellInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
/** The rally is measured over this many 1-minute bars. */
const LOOKBACK = 60;
/** Fade a rally of more than 90 bps over LOOKBACK bars. */
const RALLY_BPS = 90n;
/** Buy back after the close is 60 bps under the price the position was sold at. */
const PULLBACK_BPS = 60n;
/** Wide enough for the modelled 2 bps + pool impact; bounds a liquidity gap. */
const MAX_SLIPPAGE_BPS = 200;
const BPS = 10_000n;

// The last LOOKBACK+1 closes are all the state the rule needs. Only bars actually sent
// are stored, so a missing minute (the protocol allows gaps) simply widens the window.
const closes: bigint[] = [];
// The close at which the last fade sold; null until the first fade.
let exitPrice: bigint | null = null;

await runBars({
  onBatch(state, batch) {
    const bar = batch.bars.find((b) => b.symbol === SYMBOL);
    if (bar === undefined) return [];
    const close = BigInt(bar.c);
    closes.push(close);
    const i = closes.length - 1;

    const orders: (BuyInput | SellInput)[] = [];
    if (i === 0) {
      // Base position: fully invested from the first fill.
      orders.push({ side: 'buy', symbol: SYMBOL, notional_quote_units: state.cash, max_slippage_bps: MAX_SLIPPAGE_BPS });
      return orders;
    }
    if (i < LOOKBACK) return orders;

    const held = state.positions.get(SYMBOL);
    if (held !== undefined) {
      // Long: fade the overshoot.
      if (close * BPS > closes[i - LOOKBACK] * (BPS + RALLY_BPS)) {
        exitPrice = close;
        orders.push({ side: 'sell', symbol: SYMBOL, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS });
      }
      return orders;
    }

    // Flat: buy the pullback.
    if (exitPrice !== null && close * BPS <= exitPrice * (BPS - PULLBACK_BPS)) {
      orders.push({ side: 'buy', symbol: SYMBOL, notional_quote_units: state.cash, max_slippage_bps: MAX_SLIPPAGE_BPS });
    }
    return orders;
  },
});
