import { startWatcher, addChangeListener } from "@/lib/watcher";

export const dynamic = "force-dynamic";

export async function GET() {
  startWatcher();

  const encoder = new TextEncoder();
  let cleanup: (() => void) | null = null;
  const stream = new ReadableStream({
    start(controller) {
      const removeListener = addChangeListener((event, filePath) => {
        const data = JSON.stringify({ event, path: filePath });
        controller.enqueue(encoder.encode(`data: ${data}\n\n`));
      });

      const keepalive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        } catch {
          clearInterval(keepalive);
        }
      }, 30000);

      cleanup = () => {
        removeListener();
        clearInterval(keepalive);
      };

      controller.enqueue(encoder.encode(": connected\n\n"));
    },
    cancel() {
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
