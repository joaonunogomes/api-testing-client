import { startWatcher, addChangeListener } from "@/lib/watcher";

export const dynamic = "force-dynamic";

export async function GET() {
  startWatcher();

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const removeListener = addChangeListener((event, filePath) => {
        const data = JSON.stringify({ event, path: filePath });
        controller.enqueue(encoder.encode(`data: ${data}\n\n`));
      });

      // Send keepalive every 30s
      const keepalive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        } catch {
          clearInterval(keepalive);
        }
      }, 30000);

      // Cleanup when client disconnects
      const cleanup = () => {
        removeListener();
        clearInterval(keepalive);
      };

      // The stream will be closed when the client disconnects
      controller.enqueue(encoder.encode(": connected\n\n"));

      // Store cleanup for when stream is cancelled
      (stream as unknown as { _cleanup: () => void })._cleanup = cleanup;
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
