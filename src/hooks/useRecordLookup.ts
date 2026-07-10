import { useCallback } from 'react';
import { useAppDispatch } from '../store/hooks';
import { addEntry } from '../store/historySlice';
import type { Vehicle } from '../types/vehicle';
import type { HistoryEntry } from '../types/history';

type LookupMeta = { lookupType: 'vin' | 'plate'; plate?: string; state?: string };

/**
 * Records a lookup into local history (spec §14). No id/date generator is
 * imported at module scope — Date/random are called inside the callback at
 * call time, which is fine at runtime.
 */
export function useRecordLookup() {
  const dispatch = useAppDispatch();
  return useCallback(
    (vehicle: Vehicle, meta: LookupMeta) => {
      const entry: HistoryEntry = {
        id: `${vehicle.vin}-${Date.now()}`,
        vin: vehicle.vin,
        plate: meta.plate,
        state: meta.state,
        lookupType: meta.lookupType,
        year: vehicle.year,
        make: vehicle.make,
        model: vehicle.model,
        trim: vehicle.trim,
        lookedUpAt: new Date().toISOString(),
        tier: 'basic',
      };
      dispatch(addEntry(entry));
    },
    [dispatch],
  );
}
