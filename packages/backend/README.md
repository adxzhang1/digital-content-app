# Backend

AWS Lambda API handlers and media-processing workers. Infrastructure is defined in [`infra/lib/application-stack.ts`](../../infra/lib/application-stack.ts).

## DynamoDB Tables

All tables use string keys `PK` (partition key) and `SK` (sort key). The names below are CDK construct IDs.

### `UsersTable`

Stores private account identity and Firebase lookups.

| Record | PK | SK |
| --- | --- | --- |
| User | `USER#<userId>` | `METADATA` |
| Firebase UID lookup | `FIREBASE_UID#<firebaseUid>` | `METADATA` |

The Lambda authorizer uses the Firebase UID lookup to resolve the internal `userId` and `profileId`.

### `ProfilesTable`

Stores profile metadata, username lookups, and profile-picture processing records.

| Record | PK | SK |
| --- | --- | --- |
| Profile | `PROFILE#<profileId>` | `METADATA` |
| Username lookup | `USERNAME#<username>` | `METADATA` |
| Profile image | `PROFILE_IMAGE#<imageId>` | `METADATA` |

Username lookups resolve public usernames to profile IDs. Profile-image records track upload and processing status; successful processing updates the profile's `imageId` and `image` metadata.

### `PostsTable`

Stores post metadata, media entries, processing status, and like counts.

| Record | PK | SK |
| --- | --- | --- |
| Post | `POST#<postId>` | `METADATA` |

Profile post lists use the `GSI1` index:

- `GSI1PK`: `PROFILE#<profileId>`
- `GSI1SK`: `POST#<createdAt>#<postId>`

Index keys are added when a post reaches `READY` and removed on soft delete (`DELETED`). Profile post queries return newest posts first.

### `SubscriptionsTable`

Stores subscriptions from users to profiles.

| Record | PK | SK |
| --- | --- | --- |
| Subscription | `USER#<userId>` | `SUBSCRIPTION#<profileId>` |

Query by `PK` to list a user's subscriptions. Subscribing sets the record's status to `ACTIVE`; unsubscribing deletes the record.
