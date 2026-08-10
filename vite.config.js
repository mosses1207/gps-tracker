import { defineConfig } from 'vite';
import obfuscator from 'vite-plugin-javascript-obfuscator';

export default defineConfig({
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
      'Cross-Origin-Embedder-Policy': 'unsafe-none',
    }
  },
  preview: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
      'Cross-Origin-Embedder-Policy': 'unsafe-none',
    }
  },
  plugins: [
    obfuscator({
      options: {
        compact: true,
        controlFlowFlattening: true,
        controlFlowFlatteningThreshold: 0.75,
        deadCodeInjection: true,
        deadCodeInjectionThreshold: 0.2,
        stringArray: true,
        stringArrayEncoding: ['rc4'],
        stringArrayThreshold: 1,
        rotateStringArray: true,
        shuffleStringArray: true,
        splitStrings: true,
        splitStringsChunkLength: 5,
        selfDefending: true,
        simplify: false,
        identifierNamesGenerator: 'hexadecimal',
        renameGlobals: false,
        numbersToExpressions: true,
        disableConsoleOutput: true,
        transformObjectKeys: true,
        unicodeEscapeSequence: false
      },
    }),
  ],
  esbuild: {
    // Mematikan console.log, console.error, console.warn, dan debugger di production build
    drop: ['console', 'debugger'],
  },
});