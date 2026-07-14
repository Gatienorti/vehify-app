import React, { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

/**
 * Alignment frame with corner brackets and a looping scan line. One size fits
 * the unified scanner: wide enough for a license plate straight-on and for a
 * door-jamb VIN label strip (detection is automatic — no plate/VIN mode).
 */

const FRAME_W = 320;
const FRAME_H = 180;

const CORNER = 34;
const CORNER_THICKNESS = 4;

function Corner({ style }: { style: object }) {
  return <View style={[styles.corner, style]} />;
}

export default function ScannerFrame() {
  const [anim] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, {
          toValue: 1,
          duration: 2000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(anim, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [anim]);

  const translateY = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [8, FRAME_H - 8],
  });
  const opacity = anim.interpolate({
    inputRange: [0, 0.1, 0.9, 1],
    outputRange: [0, 1, 1, 0],
  });

  return (
    <View style={[styles.frame, { width: FRAME_W, height: FRAME_H }]}>
      <Corner style={{ top: 0, left: 0, borderTopWidth: CORNER_THICKNESS, borderLeftWidth: CORNER_THICKNESS, borderTopLeftRadius: 10 }} />
      <Corner style={{ top: 0, right: 0, borderTopWidth: CORNER_THICKNESS, borderRightWidth: CORNER_THICKNESS, borderTopRightRadius: 10 }} />
      <Corner style={{ bottom: 0, left: 0, borderBottomWidth: CORNER_THICKNESS, borderLeftWidth: CORNER_THICKNESS, borderBottomLeftRadius: 10 }} />
      <Corner style={{ bottom: 0, right: 0, borderBottomWidth: CORNER_THICKNESS, borderRightWidth: CORNER_THICKNESS, borderBottomRightRadius: 10 }} />

      <Animated.View style={[styles.lineWrap, { transform: [{ translateY }], opacity }]}>
        <LinearGradient
          colors={['rgba(46,125,246,0)', '#2E7DF6', 'rgba(46,125,246,0)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.line}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { justifyContent: 'flex-start' },
  corner: {
    position: 'absolute',
    width: CORNER,
    height: CORNER,
    borderColor: '#FFFFFF',
  },
  lineWrap: { position: 'absolute', left: 10, right: 10, top: 0 },
  line: {
    height: 3,
    borderRadius: 2,
    shadowColor: '#2E7DF6',
    shadowOpacity: 0.9,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
});
