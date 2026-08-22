# Ten Brains local API

Use Node 22. From `app/`, run:

```sh
npm run server
```

The Express API listens on `http://localhost:5174`. Vite proxies `/api` to that port. The default `MockProvider` needs no key and keeps intake turns deterministic. Set `WAYFINDER_PROVIDER=mock` explicitly when needed; later providers plug into `server/providers/index.js`.

Discovery documents persist as JSON under `server/data/`, which is ignored by git. Intake messages only append transcript entries and staged candidates. Only `POST /api/discoveries/:id/intake/approve` applies selected candidates to the map.
