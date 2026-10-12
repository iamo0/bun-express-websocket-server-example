export type MessageType = "notification";

export default function getWSContext(param: number | ReturnType<typeof Bun.serve> = 8801) {
  const server = typeof param === "number"
    ? Bun.serve({
      port: param,
      fetch(req, server) {
        const url = new URL(req.url);
        if (url.pathname === "/ws") {
          const success = server.upgrade(req, {});

          if (success) {
            return undefined;
          }
        }
        return new Response("");
      },
      websocket: {
        open(ws) {
          ws.subscribe("global");
        },
        message() {}
      }
    })
    : param;

  function broadcast(messageType: MessageType, text: string) {
    return server.publish("global", JSON.stringify({
      type: messageType,
      text,
    }));
  }

  return {
    host: `http://${server.hostname}:${server.port}/ws`,
    // NB! Server instance needed mostly for
    // tests usage and is not intended 
    // to be used from other places than this
    // code
    server,
    broadcast,
    async shutdown() {
      await server.stop(true);
    }
  }
}
