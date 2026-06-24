# Digital Content App

TypeScript monorepo with:

- `apps/web`: Next.js frontend.
- `packages/backend`: Lambda backend handler code.
- `infra`: AWS CDK app that deploys the backend as an HTTP API.

## Getting Started

```sh
pnpm install
pnpm dev
```

The frontend runs on `http://localhost:3000`.

Use `/auth` to sign in or create the Firebase-backed application account.

## Backend

Run the backend typecheck:

```sh
pnpm --filter @digital-content/backend typecheck
```

## Deploy

Configure AWS credentials, then bootstrap and deploy:

```sh
pnpm cdk -- bootstrap
aws secretsmanager create-secret \
  --name digital-content/firebase-service-account/dev \
  --secret-string file:///absolute/path/to/firebase-service-account.json
pnpm deploy
```

The CDK stack outputs an `ApiUrl`. Set it in `apps/web/.env.local`:

```sh
NEXT_PUBLIC_API_URL=https://example.execute-api.us-west-2.amazonaws.com
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
```

The Firebase project ID and service account secret name are configured in `infra/cdk.json`:

```json
{
  "firebaseProjectId": "digital-content-app-dev",
  "firebaseServiceAccountSecretName": "digital-content/firebase-service-account/dev"
}
```

The service account JSON file should stay outside the repo. The deployed authorizer Lambda reads it from AWS Secrets Manager.

## API Routes

Application routes require a Firebase ID token:

```http
Authorization: Bearer <firebase_id_token>
```

- `POST /me/onboarding`: completes account setup by creating the initial internal user and profile after Firebase signup.
- `GET /me`: resolves the signed-in Firebase user to the internal user/profile.
- `GET /profiles/{username}`: public profile metadata.
- `POST /posts/upload-urls`: creates a post ID, media IDs, and S3 upload URLs.
- `POST /posts`: finalizes uploaded media and starts image processing.
- `GET /posts/{postId}`: post processing status.
- `GET /profiles/{username}/posts`: profile-grid posts endpoint.
- `GET /profiles/{username}/posts/{postId}`: individual post details endpoint.
- `DELETE /profiles/{username}/posts/{postId}`: creator-only soft delete. Send `deleteMode=force` to also delete the DynamoDB record and S3 media objects.
- `POST /profiles/{username}/posts/{postId}/like`: like a post.
