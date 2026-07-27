import React, { createContext, useContext, useRef } from 'react';

/**
 * Lets the floating tab bar's center button trigger a capture on the Scan
 * screen. The ScanScreen registers its capture handler; the tab bar invokes it
 * (only while Scan is focused). A ref — not state — so registering the handler
 * never re-renders the tab bar or the screen.
 */
type CaptureRef = React.MutableRefObject<(() => void) | null>;

const ScanCaptureContext = createContext<CaptureRef | null>(null);

export function ScanCaptureProvider({ children }: { children: React.ReactNode }) {
  const ref = useRef<(() => void) | null>(null);
  return <ScanCaptureContext.Provider value={ref}>{children}</ScanCaptureContext.Provider>;
}

/** The shared capture-handler ref. ScanScreen sets `.current`; the tab bar calls it. */
export function useScanCaptureRef(): CaptureRef {
  const ref = useContext(ScanCaptureContext);
  if (!ref) throw new Error('useScanCaptureRef must be used within a ScanCaptureProvider');
  return ref;
}
