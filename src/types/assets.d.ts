// Metro treats .onnx as a static asset (see metro.config.js); require() returns
// an opaque asset module id consumed by expo-asset.
declare module '*.onnx' {
  const asset: number;
  export default asset;
}
