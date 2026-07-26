import React from 'react';
import Svg, { Path } from 'react-native-svg';

/**
 * Custom car-door glyph — lucide has no car-door icon (only house doors), so
 * this hand-drawn one matches lucide's stroke style (24 viewBox, round caps,
 * no fill). Prop signature mirrors a LucideIcon so it drops into the same
 * `{ icon }` slots. Used for the "Doors" spec on the Basic check.
 */
export default function CarDoorIcon({
  size = 24,
  color = 'currentColor',
  strokeWidth = 2,
}: {
  size?: number;
  color?: string;
  strokeWidth?: number;
}) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* Door outline: taller at the hinge, sloping down to the mirror side. */}
      <Path d="M3 18 L3.7 10.4 A2 2 0 0 1 5.1 8.7 L15 5.6 A2 2 0 0 1 17.5 6.9 L20.4 15.7 A1.7 1.7 0 0 1 18.8 18 Z" />
      {/* Window belt line. */}
      <Path d="M6 11.2 L15.6 8.4" />
      {/* Door handle. */}
      <Path d="M13 13.4 h3.2" />
    </Svg>
  );
}
