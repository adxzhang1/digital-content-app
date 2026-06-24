import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2
} from "aws-lambda";
import { requireEnv } from "../lib/env.js";
import { json } from "../lib/http.js";
import { getProfileByUsername } from "../lib/profiles.js";

const profilesTableName = requireEnv("PROFILES_TABLE_NAME");

export async function handler(
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyStructuredResultV2> {
  const username = event.pathParameters?.username?.trim().toLowerCase();

  if (!username) {
    return json(400, {
      code: "USERNAME_REQUIRED",
      message: "Username is required."
    });
  }

  const profile = await getProfileByUsername(profilesTableName, username);

  if (!profile) {
    return json(404, {
      code: "PROFILE_NOT_FOUND",
      message: "Profile not found."
    });
  }

  return json(200, {
    profile: {
      profileId: String(profile.profileId),
      userId: String(profile.userId),
      username: String(profile.username),
      displayName: String(profile.displayName),
      bio: String(profile.bio),
      counts: profile.counts as Record<string, unknown>
    }
  });
}
