/**
 * Unit and data-layer tests. `jest-expo` supplies the React Native transform
 * and module mocks; the database tests run the real SQL against sql.js (SQLite
 * compiled to WebAssembly), with the same synchronous drizzle driver semantics
 * the app has on the phone.
 */
module.exports = {
  preset: 'jest-expo',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts', '**/*.test.tsx'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    // Native on the phone; backed by Node's Web Crypto in tests.
    '^expo-crypto$': '<rootDir>/src/test/mocks/expo-crypto.ts',
  },
  // The @noble crypto packages ship ESM only, so they must go through Babel too.
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|react-native-svg|@noble/.*)',
  ],
};
