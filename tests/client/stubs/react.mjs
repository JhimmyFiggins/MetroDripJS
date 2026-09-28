// Minimal stand-in for the `react` runtime. Only the hooks used by the cart and
// checkout modules under test are needed, and they are driven explicitly by the
// test rather than by a renderer.
const noop = () => {};

export function useState(initial) {
  let value = typeof initial === 'function' ? initial() : initial;
  const setValue = (next) => {
    value = typeof next === 'function' ? next(value) : next;
  };
  return [value, setValue];
}

export const useRef = (initial) => ({ current: initial });
export const useEffect = noop;
export const useCallback = (fn) => fn;
export const useMemo = (fn) => fn();
export const createContext = (initial) => ({ Provider: 'Provider', Consumer: 'Consumer', _currentValue: initial });
export const useContext = (ctx) => (ctx ? ctx._currentValue : undefined);
export const forwardRef = (fn) => fn;
export const memo = (fn) => fn;
export const StrictMode = 'StrictMode';
export const Fragment = 'Fragment';
export default {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  createContext,
  useContext,
  forwardRef,
  memo,
  StrictMode,
  Fragment,
};
