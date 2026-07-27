// Learn more: https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Import .svg files as React components (react-native-svg-transformer) so the
// Vehify icon set in src/icons/vehify/ can be used like any component. Only
// icons that are actually imported get bundled — the rest of the set is
// vendored but adds nothing to the app.
config.transformer.babelTransformerPath = require.resolve('react-native-svg-transformer/expo');
config.resolver.assetExts = config.resolver.assetExts.filter((ext) => ext !== 'svg');
config.resolver.sourceExts = [...config.resolver.sourceExts, 'svg'];

module.exports = config;
