import type { TestingLibraryMatchers } from '@testing-library/jest-dom/matchers';

// vitest 4 的 Assertion 接口声明在 @vitest/expect，需在此模块合并 jest-dom 匹配器类型。
declare module '@vitest/expect' {
  interface Assertion<T = unknown> extends TestingLibraryMatchers<unknown, T> {}
  interface AsymmetricMatchersContaining extends TestingLibraryMatchers<unknown, unknown> {}
}
