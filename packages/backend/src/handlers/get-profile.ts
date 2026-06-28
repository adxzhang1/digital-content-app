import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2
} from "aws-lambda";
import { requireEnv } from "../lib/env.js";
import { json } from "../lib/http.js";
import { getMediaSigningConfig } from "../lib/media-config.js";
import { getProfileByUsername, toProfileResponse } from "../lib/profiles.js";

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
    profile: await toProfileResponse(profile, getMediaSigningConfig())
  });
}
