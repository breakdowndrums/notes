const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules ?? {}),
  'expo-keep-awake': path.resolve(__dirname, 'shims/expo-keep-awake'),
};

module.exports = config;
