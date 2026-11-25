# Tetherfall

*Wardens of the Three Bulwarks.* A fast, third-person giant-slaying action RPG that runs in the browser.

Your city is ringed by three great walls. Outside them, grinning grey giants called **Hollows** roam a forest of enormous trees. You are a new Warden with a **tether rig**: twin grappling lines, an aether-gas thruster and a pair of sunsteel blades. Swing through the city, find the ember seam on the back of a Hollow's neck, and cut it at speed.

## Play

- **Easiest:** open `dist/tetherfall.html` in Chrome, Edge or Firefox. It is one self-contained file and works straight from disk.
- **From source:** `npm install`, then `npm run build`, then serve the folder (e.g. `npx serve .`) and open `index.html`.

Click the game to capture the mouse. Esc pauses. Progress autosaves in the browser.

## Controls

| Key | Action |
| --- | --- |
| W A S D | Run, or steer while airborne |
| Mouse | Look and aim |
| Q / E | Fire left / right tether. Hold to reel in, release to let go |
| Right mouse | Fire both tethers |
| Left mouse | Slash. Faster flight = deeper cut |
| Space | Jump; in the air, gas thrust toward where you look |
| Shift | Gas dash |
| R | Swap to a fresh blade pair |
| F | Talk, resupply at depots, pass through gates |
| 1-4 | Dialogue choices |
| Tab / J, M | Journal, map |

## The world: one section per wall

| Section | Wall | What's there |
| --- | --- | --- |
| **The Greenreach Wilds** | beyond the Outer Bulwark | Giant forest, the ruins of Hollowmere, Greyhorn Tower, the Thornback's meadow, roaming Hollows |
| **Lowmarch** | inside the Outer Bulwark | Farm town, windmills, training yard, bell tower, the cracked south wall |
| **Ironvale** | inside the Middle Bulwark | Dense industrial city, canal, Warden HQ, rig workshops, training arena |
| **Solspire** | inside the Crown Bulwark | The capital: towering spires, the palace and its Lantern, the Archive |

Each section is its own large procedurally built map (900 m to 1.6 km across). You travel between them through the gates.

## Combat

- Every Hollow dies only when you sever the glowing **ember seam** on the nape. Damage scales with your speed.
- Cut an **ankle** to drop a Hollow to its knees, which lowers the nape.
- **Drudges** are the standard type, **Sprinters** leap at you, and **Brutes** stomp and need two cuts. The **Thornback** has an armored nape: cut both ankles first.
- Hollows can grab you. Mash F or click to cut yourself free.
- Blades wear out as you cut. Press R to swap pairs, and restock at green-roofed depots.

## Roleplay

- Create your Warden: name, origin (Lowmarch farmhand, Ironvale forge-born, Solspire runaway) and coat.
- Swear to a corps: Skyward Vanguard, Bulwark Watch or Crown Lancers. Each has its own perk and dialogue.
- A five-chapter main story with three endings, plus side quests: Pell's satchel, the Courier Run and Spire Run races, repeatable Wilds bounties, and 24 lost insignia hidden on high rooftops.
- Upgrade your rig with marks: gas tank, reel motor, hook range, blade edge, blade magazine, harness.

## Code layout

- `src/world.js` builds the sections, plus collision, spatial grid and raycasts
- `src/player.js` handles tether physics, slashing and the camera
- `src/hollows.js` has the Hollow models, AI, weak points and spawners
- `src/quests.js`, `src/dialogue.js` and `src/npcs.js` are the roleplay layer
- `src/ui.js`, `src/fx.js` and `src/audio.js` cover the HUD and menus, particles, and synthesized sound (there are no asset files)
