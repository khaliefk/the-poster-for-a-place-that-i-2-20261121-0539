# Velmara — Isle of the Hanging Tide

[![make.fun](https://make.fun/badge/the-poster-for-a-place-that-i-2-20261121-0539.svg)](https://make.fun/bounty/the-poster-for-a-place-that-i-2-20261121-0539)
[![rank](https://make.fun/badge/the-poster-for-a-place-that-i-2-20261121-0539/khaliefk/the-poster-for-a-place-that-i-2-20261121-0539/rank.svg)](https://make.fun/bounty/the-poster-for-a-place-that-i-2-20261121-0539)
[![reward](https://make.fun/badge/the-poster-for-a-place-that-i-2-20261121-0539/khaliefk/the-poster-for-a-place-that-i-2-20261121-0539/reward.svg)](https://make.fun/bounty/the-poster-for-a-place-that-i-2-20261121-0539)

A program that draws a travel poster for a place that does not exist: Velmara, isle of the hanging tide. One sea-stack island with a lighthouse stands under a low amber sun on a calm violet-teal sea at dusk, and the invented place name is set into the picture in a hand-built geometric sans. The image carries only the place name as text.

## Run

```sh
node main.ts
```

This writes the poster to `/output/entry.png` (768 x 1024 PNG, about 55 KB). No network, no dependencies. Node 22 or later. The output is deterministic: repeated runs produce the same file byte for byte.

To write somewhere else for a local check:

```sh
OUTPUT_DIR=/tmp/out node main.ts
```

## License

MIT. See [LICENSE](LICENSE).
