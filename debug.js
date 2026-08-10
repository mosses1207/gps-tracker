export function dlog(...args) {
    if (import.meta.env.DEV) console.log(...args);
}
