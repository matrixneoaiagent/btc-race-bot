# Strategy notes and dev-window robustness

## Rules

| state | condition | action |
|---|---|---|
| first bar | — | buy 100 % of cash |
| long | `close > close[-60] * 1.009` | sell 100 % |
| flat | `close <= exit_price * 0.994` | buy 100 % of cash |

Three parameters: 60 bars, 90 bps rally, 60 bps pullback. The bot is always
either fully long or fully in cash; there is no leverage, no shorting and one
position.

Rationale: the pool is a thin cbBTC/USDC Orca Whirlpool (about 1.0-1.4 M USDC
in-range depth on the dev window). A one-hour move of 1 % is a ~2-sigma
overshoot, and on this pool such overshoots tend to revert over the next hour.
A 60 bps pullback is the point where the reversion more than pays the ~26 bps
all-in round-trip cost. The bot does nothing when the move is smaller than that.

## Dev-window result (harness-graded, twice identical)

```
net_pnl_quote_units  29547189     (+29.547189 USDC, +2.9547189 %)
trades               11
max_drawdown         0.019816719  (1.9817 %)
sharpe               0.033141970  (hourly marks, not annualised)
sortino              0.052525679
win_rate             0.833333333  (5 of 6 round trips)
fees_quote_units     4872230
rejected             0
exposure             0.78125
cost_sensitivity     24639077     (net at 2x fees, +2.4639 %)
constraints          compliant (>=1 trade, drawdown <= 25 %)
action_log_sha256    0e55c556071aa595e91f91770be39b0c4038e5e1ac2161e57fabda181858dbdf
```

## Halves and 6-hour blocks

The frozen dev window is 1,440 bars. Splitting it in half and into four 6-hour
blocks (USDC, from the harness's per-block PnL):

| slice | bot | buy & hold | bot - B&H |
|---|---|---|---|
| hours 0-11 | +9.318939 | -5.161954 | +14.48 |
| hours 12-23 | +20.228250 | +14.957845 | +5.27 |
| 6h block 0 | +18.984235 | +7.475779 | +11.51 |
| 6h block 1 | -9.665296 | -12.637733 | +2.97 |
| 6h block 2 | +13.363178 | +11.919903 | +1.44 |
| 6h block 3 | +6.865072 | +3.037942 | +3.83 |

Both halves and all four 6-hour blocks are better than holding BTC through the
same slice. The one losing slice (6h block 1, 04:40-10:40 UTC, the dev day's
decline) loses less than buy-and-hold: -9.67 vs -12.64 USDC.

## Parameter plateau

The neighbourhood of the chosen point, all positive on the dev window (exact
fill replica, net values match the harness to the micro-USDC):

| lookback | rally | pullback | net USDC | fills |
|---|---|---|---|---|
| 60 | 80 bps | 60 bps | +26.58 | 11 |
| **60** | **90 bps** | **60 bps** | **+29.55** | **11** |
| 60 | 100 bps | 60 bps | +24.80 | 9 |
| 60 | 90 bps | 50 bps | +23.13 | 11 |
| 75 | 90 bps | 60 bps | +20.82 | 10 |
| 90 | 100 bps | 60 bps | +20.92 | 7 |

The edge does not depend on one knife-edge parameter: every neighbour is
positive with a similar trade count. Pushing the pullback to 70 bps makes the
bot too slow to re-enter and breaks the result (+12.36 USDC, no second-half
P&L), so 60 bps is the plateau edge, not a fitted spike.

## Out-of-sample-style checks

Two checks were run with an exact re-implementation of the harness fill model
(4 bps fee, 2 bps slippage, constant-product impact, next-open fills, final
flatten), validated against the kit's buy-and-hold (+9,795,891 micro-USDC) and
ema-cross (-92,685,765 micro-USDC, 67 fills) baselines to the micro-USDC.

1. **Block bootstrap.** 150 synthetic 24-hour windows were built by resampling
   the dev day's 60-bar blocks with replacement, then rescaling so each window's
   total BTC return is exactly zero ("drift-neutral"). On those windows the rule
   made a mean +2.42 USDC and a median +3.77 USDC more than buy-and-hold, and
   beat buy-and-hold in 70 % of windows. That is the check that the result is
   not only beta.
2. **Regime stress.** Adding a constant drift to the same windows, the bot
   outperforms buy-and-hold on falling days (about +3 to +6 USDC at -3 % to
   -6 %/day) and underperforms it on strongly rising days (about -29 to -58 USDC
   at +3 % to +6 %/day). That is the honest risk of a mean-reversion overlay:
   it caps upside in a one-way trend. At the 2x-fee stress the dev result is
   still +2.46 %, and the drawdown is roughly 2 %, so the guardrails are not at
   risk.

## Determinism

No `Date`, no `Math.random`, no floating point in any decision: every price
comparison is `BigInt`. `grade-local` ran the bot twice and both action logs
have sha256 `0e55c556...`, with `l1.reproduced = true`.

## Known risks

- The race window is unseen. If BTC trends up strongly all day, the bot's
  rallies-fade overlay will lag a pure buy-and-hold bot.
- The mean-reversion edge is measured on one day (five one-hour rally events).
  It is economically motivated (thin pool, impact overshoot) and survives the
  knock-out tests above, but it is not a guarantee.
- A rally that never pulls back 60 bps leaves the bot in cash; the dev day did
  not produce one, a strong trend day would.
