/**
 * The complete MedOS data model.
 *
 * Every table is declared here even when its screens are not built yet, so the
 * schema stays coherent as modules land one at a time and so migrations are
 * additive rather than a series of rewrites.
 */
export * from './_shared';
export * from './patients';
export * from './people';
export * from './places';
export * from './knowledge';
export * from './vault';
export * from './media';
export * from './system';
