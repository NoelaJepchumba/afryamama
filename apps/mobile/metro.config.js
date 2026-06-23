const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
config.resolver.disableHierarchicalLookup = true;
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules || {}),
  'react-native': path.resolve(projectRoot, 'node_modules/react-native'),
  '@react-native/codegen': path.resolve(projectRoot, 'node_modules/@react-native/codegen'),
  '@react-native/virtualized-lists': path.resolve(projectRoot, 'node_modules/@react-native/virtualized-lists'),
  '@react-native-async-storage/async-storage': path.resolve(
    projectRoot,
    'node_modules/@react-native-async-storage/async-storage'
  ),
};

module.exports = config;
