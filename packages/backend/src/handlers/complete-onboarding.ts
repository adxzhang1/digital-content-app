import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2
} from "aws-lambda";
import { TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import { getAuthenticatedUser } from "../lib/auth.js";
import { documentClient } from "../lib/dynamodb.js";
import { requireEnv } from "../lib/env.js";
import { json, parseJsonBody } from "../lib/http.js";

const usersTableName = requireEnv("USERS_TABLE_NAME");
const profilesTableName = requireEnv("PROFILES_TABLE_NAME");

const onboardingSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(
      /^[a-z0-9][a-z0-9-]{2,30}[a-z0-9]$/,
      "Username must be 4-32 lowercase letters, numbers, or hyphens."
    ),
  displayName: z.string().trim().min(1, "Display name is required.")
});

export async function handler(
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyStructuredResultV2> {
  const authenticatedUser = getAuthenticatedUser(event);

  if (!authenticatedUser?.firebaseUid) {
    return json(401, {
      code: "AUTHENTICATION_REQUIRED",
      message: "Authentication is required."
    });
  }

  if (authenticatedUser.userId && authenticatedUser.profileId) {
    return json(409, {
      code: "ACCOUNT_ALREADY_ONBOARDED",
      message: "Account setup is already complete."
    });
  }

  let body: unknown;

  try {
    body = parseJsonBody(event);
  } catch {
    return json(400, {
      code: "INVALID_JSON",
      message: "Request body must be valid JSON."
    });
  }

  const parsedBody = onboardingSchema.safeParse(body);

  if (!parsedBody.success) {
    return json(400, {
      code: "INVALID_ONBOARDING",
      message:
        parsedBody.error.issues[0]?.message ?? "Invalid onboarding payload."
    });
  }

  const email = authenticatedUser.email?.toLowerCase();

  if (!email) {
    return json(400, {
      code: "EMAIL_REQUIRED",
      message: "A verified email is required."
    });
  }

  const { username, displayName } = parsedBody.data;
  const userId = `u_${uuidv7()}`;
  const profileId = `p_${uuidv7()}`;
  const createdAt = new Date().toISOString();
  const profile = {
    profileId,
    userId,
    username,
    displayName,
    bio: "",
    counts: {
      posts: 0,
      likes: "0"
    }
  };

  try {
    await documentClient.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: usersTableName,
              Item: {
                PK: `FIREBASE_UID#${authenticatedUser.firebaseUid}`,
                SK: "METADATA",
                userId,
                profileId
              },
              ConditionExpression: "attribute_not_exists(PK)"
            }
          },
          {
            Put: {
              TableName: usersTableName,
              Item: {
                PK: `USER#${userId}`,
                SK: "METADATA",
                userId,
                firebaseUid: authenticatedUser.firebaseUid,
                email,
                profileId,
                createdAt
              },
              ConditionExpression: "attribute_not_exists(PK)"
            }
          },
          {
            Put: {
              TableName: profilesTableName,
              Item: {
                PK: `USERNAME#${username}`,
                SK: "METADATA",
                profileId
              },
              ConditionExpression: "attribute_not_exists(PK)"
            }
          },
          {
            Put: {
              TableName: profilesTableName,
              Item: {
                PK: `PROFILE#${profileId}`,
                SK: "METADATA",
                ...profile,
                createdAt
              },
              ConditionExpression: "attribute_not_exists(PK)"
            }
          }
        ]
      })
    );
  } catch {
    return json(409, {
      code: "ONBOARDING_CONFLICT",
      message: "Username, user, or profile already exists."
    });
  }

  return json(201, {
    user: {
      userId,
      email,
      profileId,
      username
    },
    profile
  });
}
