# Thrust

TLDR; Checkout the game at http://demo.saygoweb.com/thrust

This is a 2D game with a bit of a nod to the Commodore 64 game 'Thrust' which I remember (vaguely) from the late '80s.  The game is more of a fusion of Lunar Lander, Thrust, Gravity, and the like.

## Game Play

- left / right rotate the ship.
- up provides thrust in the direction the ship is pointing.
- space fires.

Avoid the enemy bullets, rescue your companions and return them to the base.  Don't run out of fuel, and don't sustain too much damage.

## Development

Requires Node 22.12+.

```
npm install
npm run dev      # dev server with live reload
npm run build    # production build in dist/
npm run typecheck # TypeScript type check (tsc -b)
npm run lint     # ESLint with typescript-eslint
npm test         # unit tests, asset/level checks and a test build
npm run test:e2e # plays the built game in headless Chromium (first: npx playwright install chromium)
```

The game and its tests are written in TypeScript. Vite strips the types when it builds, so `npm run typecheck` is the step that checks them.

CI (`.github/workflows/ci.yml`) type-checks, lints, tests and builds every push and pull request. When a push to `master` passes, CI deploys it to the demo site.

## Status

Currently this is just my experiment with the [Phaser](https://phaser.io) HTML5 game framework (Phaser 4).