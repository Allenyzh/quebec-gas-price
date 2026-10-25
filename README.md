# Quebec Gas Price interactive map

Gas station data comes from [Régie de l’énergie du Québec](https://www.regie-energie.qc.ca/fr).
The Leaflet basemap uses [CARTO Basemaps](https://www.carto.com/basemaps/) and requires a CARTO Basemaps API key.

## CARTO key and website restrictions

Request your own key from [CARTO](https://www.carto.com/basemaps/apikey/index.html), then configure its allowed websites in the [Basemaps dashboard](https://dashboard.basemaps.carto.com/):

- Production: allow `allenyzh.github.io`, plus your custom domain if you use one.
- Development: use a separate key restricted to `localhost` or `127.0.0.1`, matching the host you open in your browser.

Use the restriction format supported by the dashboard. The key is included in the built JavaScript and browser tile requests because it is a [Vite `VITE_` variable](https://vite.dev/guide/env-and-mode#env-variables); website restrictions and CARTO usage monitoring are necessary for a public frontend key. Keep the OpenStreetMap and CARTO attribution visible.

## Local development

```sh
pnpm install --frozen-lockfile
cp .env.example .env.local
```

Set `VITE_CARTO_API_KEY` in `.env.local` to your development key, then run:

```sh
pnpm dev
```

Restart Vite after changing the key. Local `.env*` configuration is ignored by Git; `.env.example` is the committed template. Without a key, the app shows a basemap warning while station markers and the station list remain available.

Location is on by default and requires browser permission. The location and privacy settings explain that coordinates are sent to OSRM (`router.project-osrm.org`) for driving distances and routes. Users can turn location off there, and that choice is remembered on later visits. Dismissing the notice does not change the location setting. Turning location off cancels pending routing requests and removes the displayed user position and route.

The all-fuels view labels each fuel price and groups colocated prices in map popups. Price statistics, rankings, and nearby recommendations are available after selecting a single fuel type.

## Validation

```sh
pnpm test
pnpm lint
pnpm build
```

The regression tests use Node's built-in test runner and controlled browser/network callbacks, with no live location or external routing requests.

## GitHub Pages deployment

1. Open the repository's **Settings → Secrets and variables → Actions → Variables** and create a repository variable named `VITE_CARTO_API_KEY` with your production key.
2. Confirm its CARTO website restrictions allow the deployed hostname.
3. Push to `main`, or run **Actions → Deploy to GitHub Pages → Run workflow** on `main` after adding or changing the variable.

The workflow injects the variable at build time and fails before deployment when it is missing or blank. Changing the variable requires a new build to update the published site. A nonempty key can still be invalid or restricted incorrectly; if tiles remain unavailable, check the key, website restrictions, and usage in CARTO, then reload the site.
