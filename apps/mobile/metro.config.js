// Metro config tuned for the MedOS npm-workspaces monorepo.
// Without watchFolders + nodeModulesPaths, Metro cannot resolve packages
// that npm hoists to the repo root instead of apps/mobile/node_modules.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// Hierarchical lookup stays ON. Disabling it is the usual pnpm advice, but with
// npm workspaces it breaks any package that reaches for a transitive dependency
// nested inside another package's node_modules — reanimated pulling in `semver`
// is the case that caught this.
config.resolver.disableHierarchicalLookup = false;

// Drizzle ships migrations as .sql; inline-import turns them into JS strings.
config.resolver.sourceExts.push('sql');

module.exports = config;
