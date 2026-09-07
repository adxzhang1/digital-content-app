# Digital Content App

TypeScript monorepo with a Next.js frontend, AWS Lambda backend, and CDK infrastructure.

- `apps/web`: frontend.
- `packages/backend`: API handlers. See the [backend docs](packages/backend/README.md) for the data model.
- `infra`: AWS infrastructure.

## Local Development

Requires Node.js 22 or later.

Copy `apps/web/.env.example` to `apps/web/.env.local` and fill in the API URL and Firebase configuration.

```sh
npm install
npm run dev
```

Open http://localhost:3000. Sign in or create an account at `/auth`.

## Checks

```sh
npm run lint
npm run typecheck
npm run build
```

## Deploy

Configure AWS credentials and the stage in `infra/bin/app.ts`. The following SSM parameters must exist under `/digital-content/<stage>/`:

- `firebase-service-account`: service account JSON (`SecureString`).
- `media-signing-public-key`: public key (`String`).
- `media-signing-private-key`: private key (`SecureString`).

```sh
npm run deploy
```

Set `NEXT_PUBLIC_API_URL` in `apps/web/.env.local` to the stack's `ApiUrl` output.
