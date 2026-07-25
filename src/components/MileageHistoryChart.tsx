import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Stop, Text as SvgText } from 'react-native-svg';
import { useTheme } from '../theme';
import type { MileagePoint } from '../types/vehicle';

interface Props {
  history: MileagePoint[];
  rollback?: boolean;
  /** Drop the dense per-visit Service readings (keep title / state
   *  registration / inspection / auction), but always keep the most recent
   *  reading so current mileage still shows. */
  excludeService?: boolean;
}

/* Geometry in SVG user units — identical to the web chart
   (resources/js/Components/MileageHistoryChart.vue) so both surfaces draw the
   same picture. Scales to the container via viewBox. */
const W = 760;
const H = 300;
const PAD_L = 48;
const PAD_R = 18;
const PAD_T = 30;
const PAD_B = 46;
const PLOT_W = W - PAD_L - PAD_R;
const PLOT_H = H - PAD_T - PAD_B;
const BASE_Y = PAD_T + PLOT_H;

const yearOf = (d: string) => (String(d).match(/\d{4}/) || [d])[0];
const fmtK = (n: number) =>
  n >= 1000 ? `${+(n / 1000).toFixed(n % 1000 ? 1 : 0)}k` : String(Math.round(n));

/**
 * Odometer-over-time line chart — readings plotted in order; a segment that
 * goes DOWN (mileage decreased) draws red: that's a rollback, the whole point
 * of showing this. Mirror of the web report's chart.
 */
export default function MileageHistoryChart({ history, rollback, excludeService }: Props) {
  const { colors } = useTheme();

  const all = (history ?? []).filter((m) => m && m.mileage != null);
  let pts = all;
  if (excludeService && all.length) {
    const last = all[all.length - 1];
    const kept = all.filter((m) => !/servic/i.test(m.source ?? ''));
    if (kept[kept.length - 1] !== last) kept.push(last);
    pts = kept;
  }
  if (pts.length === 0) return null;

  const max = Math.max(1, ...pts.map((m) => m.mileage));
  const pow = 10 ** Math.floor(Math.log10(max));
  const step = pow / 2;
  const yMax = Math.max(step, Math.ceil(max / step) * step);

  const n = pts.length;
  const coords = pts.map((m, i) => {
    const x = n === 1 ? PAD_L + PLOT_W / 2 : PAD_L + (i / (n - 1)) * PLOT_W;
    const y = BASE_Y - (m.mileage / yMax) * PLOT_H;
    return { ...m, x, y, drop: i > 0 && m.mileage < pts[i - 1].mileage };
  });

  const segments = coords.slice(1).map((p, i) => ({
    x1: coords[i].x,
    y1: coords[i].y,
    x2: p.x,
    y2: p.y,
    drop: p.drop,
  }));

  const areaPath = `M ${coords[0].x} ${BASE_Y} ${coords
    .map((p) => `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ')} L ${coords[n - 1].x} ${BASE_Y} Z`;

  const grid = Array.from({ length: 5 }, (_, i) => {
    const val = (yMax / 4) * i;
    return { y: BASE_Y - (val / yMax) * PLOT_H, label: fmtK(val) };
  });

  // Label thinning, anchored to the LAST (most important) reading.
  const dateEvery = Math.max(1, Math.ceil(n / 8));
  const showDate = (i: number) => (n - 1 - i) % dateEvery === 0;
  const pointSpacing = n > 1 ? PLOT_W / (n - 1) : PLOT_W;
  const labelStep = Math.max(1, Math.ceil(52 / pointSpacing));
  const showLabel = (i: number) => (n - 1 - i) % labelStep === 0;

  return (
    <View style={styles.wrap}>
      <Svg viewBox={`0 0 ${W} ${H}`} width="100%" style={styles.svg} preserveAspectRatio="xMidYMid meet">
        <Defs>
          <LinearGradient id="mhGrad" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#0567FA" stopOpacity={0.22} />
            <Stop offset="1" stopColor="#0567FA" stopOpacity={0} />
          </LinearGradient>
        </Defs>

        {grid.map((g, i) => (
          <G key={`g${i}`}>
            <Line x1={PAD_L} y1={g.y} x2={W - PAD_R} y2={g.y} stroke={colors.border} strokeWidth={1} />
            <SvgText x={PAD_L - 8} y={g.y + 3} textAnchor="end" fontSize={10} fill={colors.textMuted}>
              {g.label}
            </SvgText>
          </G>
        ))}

        <Path d={areaPath} fill="url(#mhGrad)" />
        {segments.map((s, i) => (
          <Line
            key={`s${i}`}
            x1={s.x1}
            y1={s.y1}
            x2={s.x2}
            y2={s.y2}
            stroke={s.drop ? '#E5484D' : '#0567FA'}
            strokeWidth={3}
            strokeLinecap="round"
          />
        ))}

        {coords.map((p, i) => (
          <G key={`p${i}`}>
            <Circle
              cx={p.x}
              cy={p.y}
              r={4}
              fill={p.drop ? '#E5484D' : '#ffffff'}
              stroke={p.drop ? '#E5484D' : '#0567FA'}
              strokeWidth={2}
            />
            {showLabel(i) || p.drop ? (
              <SvgText
                x={p.x}
                y={p.y - 10}
                textAnchor="middle"
                fontSize={10}
                fontWeight="700"
                fill={p.drop ? '#E5484D' : colors.text}
              >
                {p.mileage.toLocaleString()}
              </SvgText>
            ) : null}
            {showDate(i) ? (
              <SvgText x={p.x} y={H - PAD_B + 18} textAnchor="middle" fontSize={10} fill={colors.textMuted}>
                {yearOf(p.date)}
              </SvgText>
            ) : null}
          </G>
        ))}
      </Svg>
      {rollback ? (
        <Text style={[styles.rollback, { color: colors.danger }]}>
          ⚠ Possible odometer rollback — a later reading is lower than an earlier one.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingVertical: 8 },
  svg: { aspectRatio: W / H, width: '100%' },
  rollback: { fontSize: 13, fontWeight: '600', marginTop: 4 },
});
