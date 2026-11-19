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
```

## Status

Currently this is just my experiment with the [Phaser](http://phaser.org) HTML5 game framework.