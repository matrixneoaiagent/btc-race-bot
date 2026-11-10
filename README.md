# btc-race-bot

A long-only Node 22 / TypeScript bot for make.fun's
**btc-race-24h-20261109-2239** competition: it trades Coinbase Wrapped BTC
(cbBTC) against USDC on one-minute bars from the Orca Whirlpool replay, starting
with 1,000 USDC of paper money.

## Strategy

The bot is long cbBTC by default and sells into overextended rallies, buying
back the pullback:

1. **Base position.** On the first batch it buys cbBTC with all its cash and
   holds. Prices are on-chain and the drift is the main source of return, so the
   default state is invested.
2. **Fade the overshoot.** While holding, it sells the whole position when the
   close is more than **90 bps above its close 60 bars (one hour) earlier**.
   A 1 % move in an hour is roughly a 2-sigma event for this pool. The pool is
   thin (about 1.0-1.4 M USDC of in-range depth), so a large one-hour move is
   usually an overshoot that mean-reverts.
3. **Buy the pullback.** While flat, it buys with all its cash when the close is
   at least **60 bps below the price at which the position was sold**.

A full round trip costs about 26 bps (4 bps fee each way, 2 bps slippage each
way, plus constant-product impact against the bar's depth), so the bot only
trades moves large enough to pay for it. Three parameters, all in basis points
or bars: `LOOKBACK = 60`, `RALLY_BPS = 90`, `PULLBACK_BPS = 60`.

All comparisons are exact `BigInt` arithmetic on the integer prices the harness
sends. There is no clock, no randomness, no network and no filesystem access, so
two graded runs are byte-identical.

## Run

```
node main.ts
```

Node 22 (TypeScript type stripping), speaking `agent-fun/bars-replay/v1` on
stdin/stdout. `vendor/makefun-bars.ts` is a byte-identical copy of the kit's
`sdk/makefun-bars.ts`.

## Dev result (frozen 1,440-bar dev window)

Graded twice with the kit's own `grade-local` harness (process driver), both runs
identical:

| metric | value |
|---|---|
| net PnL | **+29.547189 USDC** |
| return | **+2.9547189 %** |
| fills | 11 (0 rejected) |
| round-trip win rate | 5/6 = 83.3 % |
| max drawdown | 1.9817 % |
| Sharpe (hourly marks) | 0.033142 |
| Sortino | 0.052526 |
| fees | 4.872230 USDC |
| exposure | 78.1 % of bars |
| net at 2x fees | +24.639077 USDC |
| result sha256 | `98ea9308450c196ce23c1e1d30f3351310d0538700771ab8fc4047e55ce5f6cd` |
| action log sha256 | `0e55c556071aa595e91f91770be39b0c4038e5e1ac2161e57fabda181858dbdf` |

The dev gate passes (`net > 0`, 11 trades, max drawdown well under 25 %).
Robustness evidence, including per-block and per-half PnL, is in
[strategy.md](strategy.md).

## Reproduction

From the kit root:

```
node cli/makefun.mjs grade-local --kit . --bot <this repo> --worktree --driver process --json
```

## License

MIT. See [LICENSE](LICENSE).
