// Shared game context. Modules attach themselves here to avoid circular imports.
export const G = {
  time: 0,
  timeScale: 1,
  hollows: [],
  npcs: [],
  world: null,
  player: null,
  save: null,
  state: 'title', // title | create | play | dialog | menu | loading | dead | shop
};
