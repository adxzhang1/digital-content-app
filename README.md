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
aws ssm put-parameter \
  --name /digital-content/dev/firebase-service-account \
  --type SecureString \
  --value "$(cat /absolute/path/to/firebase-service-account.json)" \
  --overwrite
aws ssm put-parameter \
  --name /digital-content/dev/media-signing-public-key \
  --type String \
  --value "$(cat /absolute/path/to/media-public-key-dev.pem)" \
  --overwrite
aws ssm put-parameter \
  --name /digital-content/dev/media-signing-private-key \
  --type SecureString \
  --value "$(cat /absolute/path/to/media-private-key-dev.pem)" \
  --overwrite
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

The backend SSM parameter names are configured in `infra/cdk.json`:

```json
{
  "firebaseServiceAccountParameterName": "/digital-content/dev/firebase-service-account",
  "mediaSigningPublicKeyParameterName": "/digital-content/dev/media-signing-public-key",
  "mediaSigningPrivateKeyParameterName": "/digital-content/dev/media-signing-private-key"
}
```

The service account JSON and media private key should stay outside the repo. The deployed Lambdas read them from encrypted SSM parameters. The media public key is stored as a standard SSM string parameter for CloudFront configuration.

## API Routes

Application routes require a Firebase ID token:

```http
Authorization: Bearer <firebase_id_token>
```

- `POST /me/onboarding`: completes account setup by creating the initial internal user and profile after Firebase signup.
- `GET /me`: resolves the signed-in Firebase user to the internal user/profile.
- `GET /profiles/{username}`: public profile metadata.
- `POST /posts/upload`: creates a post ID, media IDs, and presigned S3 uploads.
- `POST /posts`: finalizes uploaded media and starts image processing.
- `GET /posts/{postId}`: post processing status.
- `GET /profiles/{username}/posts`: profile-grid posts endpoint.
- `GET /subscriptions/profile/{profileId}`: gets the current user's subscription status for a profile.
- `PUT /subscriptions/profile/{profileId}`: subscribes the current user to a profile.
- `DELETE /subscriptions/profile/{profileId}`: removes the current user's subscription to a profile.
- `GET /me/subscriptions`: lists profiles the current user subscribes to.
- `GET /profiles/{username}/posts/{postId}`: individual post details endpoint.
- `DELETE /profiles/{username}/posts/{postId}`: creator-only soft delete. Send `deleteMode=force` to also delete the DynamoDB record and S3 media objects.
- `POST /profiles/{username}/posts/{postId}/like`: like a post.
