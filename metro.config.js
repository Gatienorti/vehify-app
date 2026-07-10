// Learn more: https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Bundle ONNX models as static assets so they can be resolved via expo-asset.
config.resolver.assetExts.push('onnx');

module.exports = config;
