const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '..');
const sharedRoot = path.resolve(monorepoRoot, 'shared');

const config = getDefaultConfig(projectRoot);

// Watch frontend + shared + monorepo root so Metro can reach hoisted node_modules
config.watchFolders = [projectRoot, sharedRoot, monorepoRoot];

// Resolve modules from frontend first, then monorepo root
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

// Map @ablog/shared package to local source so Metro can bundle it
config.resolver.extraNodeModules = {
  '@ablog/shared': sharedRoot,
};

module.exports = config;
