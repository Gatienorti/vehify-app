import { requireOptionalNativeModule } from 'expo-modules-core';

export type NativeRectangle = {
  confidence: number;
  /** TL, TR, BR, BL as normalized x/y pairs in top-left image coordinates. */
  corners: number[];
};

export type NativeRectification = {
  rectifiedUri: string;
  previewUri: string;
  width: number;
  height: number;
};

type VehifyPlateDetectorNativeModule = {
  detectRectanglesAsync(uri: string): Promise<NativeRectangle[]>;
  rectifyPlateAsync(uri: string, corners: number[]): Promise<NativeRectification>;
};

export default requireOptionalNativeModule<VehifyPlateDetectorNativeModule>(
  'VehifyPlateDetector',
);
