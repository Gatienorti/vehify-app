import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';
import { useTheme } from '../theme';

interface Props {
  /** The estimated market value — the curve's peak. */
  average: number;
  low?: number | null;
  high?: number | null;
  /** Legacy reports only (the asking-price input was removed product-wide). */
  asking?: number | null;
  /** Comparable-listing count backing the estimate (footnote). */
  comps?: number | null;
}

/* Curve geometry in SVG user units — identical math to the web component
   (resources/js/Components/MarketValueCurve.vue) so both surfaces draw the
   same picture. Scales to the container via viewBox. */
const W = 400;
const BASE = 120;
const PEAK = 28;
const AMP = BASE - PEAK;
const SIGMA = W / 6; // ±3σ spans the full width → tails settle on the baseline
const gy = (x: number) => BASE - AMP * Math.exp(-0.5 * ((x - W / 2) / SIGMA) ** 2);

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

const PATHS = (() => {
  let d = `M 0 ${BASE}`;
  for (let x = 0; x <= W; x += 4) d += ` L ${x} ${gy(x).toFixed(1)}`;
  let l = `M 0 ${gy(0).toFixed(1)}`;
  for (let x = 4; x <= W; x += 4) l += ` L ${x} ${gy(x).toFixed(1)}`;
  return { fill: `${d} L ${W} ${BASE} Z`, line: l };
})();

const usd = (n: number) => `$${n.toLocaleString()}`;

/**
 * Market-value bell curve — the estimate is the peak (market average),
 * low/high are the below/above-market shoulders, and a legacy asking price
 * lands as a gold marker. Mirror of the web report's curve.
 */
export default function MarketValueCurve({ average, low, high, asking, comps }: Props) {
  const { colors } = useTheme();

  // Price → x. Anchor low/high at ±100 units from centre; ±8% fallback.
  const hi = high != null ? high - average : 0;
  const lo = low != null ? average - low : 0;
  const spread = Math.max(hi, lo) > 0 ? Math.max(hi, lo) : Math.max(1, Math.round(average * 0.08));
  const priceToX = (p: number) => clamp(W / 2 + ((p - average) / spread) * 100, 14, W - 14);

  const peakX = W / 2;
  const lowX = low != null ? priceToX(low) : null;
  const highX = high != null ? priceToX(high) : null;
  const askX = asking != null ? priceToX(asking) : null;

  return (
    <View style={styles.wrap}>
      <Text style={[styles.peakLabel, { color: colors.textMuted }]}>MARKET AVERAGE</Text>
      <Text style={[styles.peakValue, { color: colors.text }]}>{usd(average)}</Text>

      <Svg viewBox={`0 0 ${W} 130`} width="100%" height={undefined} style={styles.svg} preserveAspectRatio="xMidYMid meet">
        <Defs>
          <LinearGradient id="mvGrad" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#34D399" stopOpacity={0.5} />
            <Stop offset="1" stopColor="#0567FA" stopOpacity={0.5} />
          </LinearGradient>
        </Defs>
        <Path d={PATHS.fill} fill="url(#mvGrad)" />
        <Path d={PATHS.line} fill="none" stroke={colors.border} strokeWidth={1.5} />
        <Line x1={0} y1={BASE} x2={W} y2={BASE} stroke={colors.border} strokeWidth={1} />

        <Circle cx={peakX} cy={gy(peakX)} r={3.5} fill="#0567FA" />
        {lowX != null ? <Circle cx={lowX} cy={gy(lowX)} r={3} fill="#0567FA" /> : null}
        {highX != null ? <Circle cx={highX} cy={gy(highX)} r={3} fill="#0567FA" /> : null}

        {askX != null ? (
          <>
            <Line x1={askX} y1={gy(askX)} x2={askX} y2={BASE} stroke="#E0A106" strokeWidth={2} strokeDasharray="3 3" />
            <Circle cx={askX} cy={gy(askX)} r={4.5} fill="#E0A106" stroke="#fff" strokeWidth={1.5} />
          </>
        ) : null}
      </Svg>

      {asking != null ? (
        <Text style={[styles.askNote, { color: colors.warning }]}>Asking {usd(asking)}</Text>
      ) : null}

      {low != null || high != null ? (
        <View style={styles.shoulders}>
          {low != null ? (
            <View>
              <Text style={[styles.shoulderValue, { color: colors.text }]}>{usd(low)} or less</Text>
              <Text style={[styles.shoulderLabel, { color: colors.textMuted }]}>Below market</Text>
            </View>
          ) : (
            <View />
          )}
          {high != null ? (
            <View>
              <Text style={[styles.shoulderValue, styles.right, { color: colors.text }]}>{usd(high)} or more</Text>
              <Text style={[styles.shoulderLabel, styles.right, { color: colors.textMuted }]}>Above market</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {comps ? (
        <Text style={[styles.compsNote, { color: colors.textMuted }]}>
          Estimated from {comps.toLocaleString()} comparable listings.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingTop: 12, paddingBottom: 6 },
  peakLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 0.6, textAlign: 'center' },
  peakValue: { fontSize: 24, fontWeight: '800', textAlign: 'center', marginTop: 1 },
  svg: { aspectRatio: 400 / 130, width: '100%', marginTop: 4 },
  askNote: { fontSize: 12, fontWeight: '700', textAlign: 'center', marginTop: 2 },
  shoulders: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  shoulderValue: { fontSize: 13, fontWeight: '700' },
  shoulderLabel: { fontSize: 12, marginTop: 1 },
  right: { textAlign: 'right' },
  compsNote: { fontSize: 11, textAlign: 'center', marginTop: 8 },
});
