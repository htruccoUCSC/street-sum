# D3: {game title goes here}

## Game Design Vision

{a few-sentence description of the game mechanics}

## Technologies

- TypeScript for most game code, little to no explicit HTML, and all CSS collected in common `style.css` file
- Deno and Vite for building
- GitHub Actions + GitHub Pages for deployment automation

## Assignments

## D3.a: Core mechanics (token collection and crafting)

Key technical challenge: Can you assemble a map-based user interface using the Leaflet mapping framework?
Key gameplay challenge: Can players collect and craft tokens from nearby locations to finally make one of sufficiently high value?

### D3.a Steps

- [x] copy main.ts to reference.ts for future reference
- [x] delete everything in main.ts
- [x] put a basic leaflet map on the screen
- [x] draw the player's location on the map
- [x] draw a rectangle representing one cell on the map
- [x] use loops to draw a whole grid of cells on the map
- [x] populate cells with tokens using a deterministic hashing mechanism
- [x] display if cells are populated with a coin image
- [x] allow players to pick up tokens from cells
- [x] allow players to craft a new token play placing their token in a cell with a token of equal value
- [x] add notice for when player reaches a "sufficient" value

## D3.b: Globe-spanning Gameplay (movement and generation)

Key technical challenge: Can you generate cells around the players location and camera placement?
Key gameplay challenge: Can players move around the cells and collect previously unreachable tokens?

### D3.b Steps

- [x] Allign cells using an earth-spanning coordinate system
- [x] Generate a grid of cells centered around the players camera
- [x] Add player movment buttons to the lower interface
- [x] Add the ability for the player to move from cell to cell by pressing one of the buttons
- [ ] Dynamicaly update the players 3 cell interaction range when moving
- [ ] Increase the sufficient value threshold to 128
