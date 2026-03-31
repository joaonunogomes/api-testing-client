import { NextResponse } from "next/server";
import {
  getCollection,
  getEnvironment,
  getRequest,
} from "@/lib/workspace";
import { executeRequest } from "@/lib/executor";

export async function POST(request: Request) {
  const body = await request.json();
  const { collectionId, requestId, environmentId, oauth2Token, requestData } =
    body;

  // Inline request data (e.g. from example/scratchpad tab)
  if (requestData) {
    const environment = environmentId
      ? await getEnvironment(environmentId)
      : null;

    const result = await executeRequest(requestData, null, environment);
    return NextResponse.json(result);
  }

  if (!collectionId || !requestId) {
    return NextResponse.json(
      { error: "collectionId and requestId are required" },
      { status: 400 },
    );
  }

  const requestFile = await getRequest(collectionId, requestId);
  if (!requestFile) {
    return NextResponse.json(
      { error: `Request not found: ${collectionId}/${requestId}` },
      { status: 404 },
    );
  }

  const collection = await getCollection(collectionId);
  const environment = environmentId
    ? await getEnvironment(environmentId)
    : null;

  const result = await executeRequest(
    requestFile,
    collection,
    environment,
    oauth2Token,
  );

  return NextResponse.json(result);
}
