# Stonetop for Foundry VTT

An unofficial [Foundry VTT](https://foundryvtt.com) system for playing [Stonetop](https://plusoneexp.com/collections/stonetop) by Jeremy Strandberg.

> ## About this fork
>
> This is [dwpowell88](https://github.com/dwpowell88)'s personal fork of
> [taylor-nightingale/stonetop](https://github.com/taylor-nightingale/stonetop), used to run a
> home game. It is **not** a competing project — improvements that make sense upstream are kept
> on individual topic branches so they can be offered back as pull requests:
>
> - `main` — tracks upstream, never diverges.
> - `fix/*`, `feat/*` — self-contained candidate contributions (PDF importer fixes, a Book I
>   importer, module pack tooling, an artifacts extractor).
> - **`personal`** (this branch) — all of the above merged together, plus commits tagged
>   `[personal]` that regenerate content packs for this machine. Those regens reference book
>   illustrations by the sha256 of locally extracted files, so they only resolve against art
>   extracted on the same machine — useful to nobody else, and never intended for upstream.
>
> Book **text** here is CC BY-SA 4.0 (see License below). Book **artwork** is © Lucie Arnoux and
> is never committed to this repository — paths under `stonetop-art/` resolve only against a
> private, locally extracted art store.

> This system is under active development and may be unstable.

## Prerequisites

- Foundry VTT v13 or v14

## Installation

In Foundry VTT, go to **Game Systems → Install System** and paste this manifest URL:

```
https://github.com/taylor-nightingale/stonetop/releases/latest/download/system.json
```

## Development

```bash
npm install        # install dev dependencies
npm run pack       # compile JSON source into LevelDB compendium packs
npm run unpack     # extract packs back to JSON source
npm test           # run tests
```

## License

Code is licensed under the [MIT License](LICENSE).

Some CSS/HTML and assets derived with permission from dice-goblin's beautiful [stonetop system](https://github.com/Dice-Goblin-Click-Clack/Stonetop)

Game content (and trade dress) are derived from [Stonetop](https://plusoneexp.com/collections/stonetop) by Jeremy Strandberg and used under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).

The Stonetop maps are Lucie’s illustrations (C), and should not be distributed in this repository.
