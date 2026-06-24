import type { APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { json } from "../lib/http.js";

export async function handler(): Promise<APIGatewayProxyStructuredResultV2> {
  return json(200, {
    status: "ok",
    service: "backend"
  });
}
