import { subscribeMockServerLogs } from "@/lib/mock-server";

export const dynamic = "force-dynamic";

/**
 * GET /api/mock-server/log?collectionId=xxx — SSE stream of mock server request logs
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const collectionId = url.searchParams.get("collectionId");

  if (!collectionId) {
    return new Response("collectionId is required", { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const unsubscribe = subscribeMockServerLogs(collectionId, (entry) => {
        const data = JSON.stringify(entry);
        controller.enqueue(encoder.encode(`data: ${data}\n\n`));
      });

      const keepalive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        } catch {
          clearInterval(keepalive);
        }
      }, 30000);

      controller.enqueue(encoder.encode(": connected\n\n"));

      (stream as unknown as { _cleanup: () => void })._cleanup = () => {
        unsubscribe();
        clearInterval(keepalive);
      };
    },
    cancel() {
      const cleanup = (this as unknown as { _cleanup?: () => void })._cleanup;
      cleanup?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
