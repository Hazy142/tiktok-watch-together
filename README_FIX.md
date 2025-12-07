# Build Error Fix

The project is failing to build because of a corrupted configuration file in your Downloads folder:
`e:/Users/gagah/Downloads/tsconfig.json`

This file contains invalid syntax (`# Korrekte tsconfig.json...`) which is confusing the build tool (Vite/esbuild).

## How to Fix
1.  Go to `e:/Users/gagah/Downloads/` in your file explorer.
2.  Delete or rename the `tsconfig.json` file in that folder.
3.  Come back here and run `npm run dev` to start the frontend.

## Running the App
Once you have fixed the file above:
1.  **Backend**: `node server/index.js` (Running on port 3001)
2.  **Frontend**: `npm run dev` (Will run on port 5173 usually)
