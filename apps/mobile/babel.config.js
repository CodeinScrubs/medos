module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // Lets `import migration from './0000_x.sql'` work, which is how
      // drizzle-orm/expo-sqlite bundles migrations into the app binary.
      ['inline-import', { extensions: ['.sql'] }],
    ],
  };
};
