# Backend

## DynamoDB Tables

### `UsersTable`

Stores private account identity and Firebase lookup records.

Keys:

```txt
PK
SK
```

Entities:

```txt
User:
  PK = USER#<userId>
  SK = METADATA

Firebase UID lookup:
  PK = FIREBASE_UID#<firebaseUid>
  SK = METADATA
```

`User` is used for direct internal user access by immutable `userId`.

`Firebase UID lookup` is used by the Lambda authorizer to resolve a Firebase user to the internal app user/profile.

### `ProfilesTable`

Stores public profile identity and username lookup records.

Keys:

```txt
PK
SK
```

Entities:

```txt
Profile:
  PK = PROFILE#<profileId>
  SK = METADATA

Username lookup:
  PK = USERNAME#<username>
  SK = METADATA
```

`Profile` is used for direct profile access by immutable `profileId`.

`Username lookup` is used to resolve the public route parameter `username` to the immutable `profileId`.

### `PostsTable`

Stores post records. Direct post operations use the base table key. Profile post lists use `GSI1`.

Keys:

```txt
PK
SK
GSI1PK
GSI1SK
```

Entities:

```txt
Post:
  PK = POST#<postId>
  SK = METADATA

  GSI1PK = PROFILE#<profileId>
  GSI1SK = POST#<createdAt>#<postId>
```

`PK` and `SK` are used for direct post access by immutable `postId`.

`GSI1PK` and `GSI1SK` are only populated when a post reaches `READY`. They are removed on soft delete. Querying `GSI1PK = PROFILE#<profileId>` returns visible posts for a profile in created-at order.
