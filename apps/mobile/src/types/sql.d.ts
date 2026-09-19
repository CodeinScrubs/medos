/**
 * Drizzle migrations are imported as raw SQL strings. `babel-plugin-inline-import`
 * turns the import into a string literal at build time; this tells TypeScript
 * what to expect.
 */
declare module '*.sql' {
  const content: string;
  export default content;
}
