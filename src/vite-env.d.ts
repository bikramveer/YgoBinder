/// <reference types="vite/client" />

declare global {
  interface Window {
    HoloCircuit: { mount: (el: Element) => void; mountAll: (root?: Document | Element) => void };
    HoloText: { decode: (el: Element, opts?: object) => void; decodeAll: (root?: Document | Element) => void };
    HoloTransition: { fade: (apply: () => void, opts?: { color?: string; duration?: number }) => void; digitize: (apply: () => void, opts?: { color?: string; duration?: number }) => void };
  }
}
