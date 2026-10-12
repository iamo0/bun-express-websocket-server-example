import { describe, expect, expectTypeOf, it } from "bun:test";
import getWSContext from ".";

describe("WS server context", function () {
  describe("WS server instance", function () {
    it("getWSContext contains an instance of running WebSocket server and a host param with its URL", async function () {
      const { server, host } = getWSContext();
      const client = new WebSocket(host);
      const response = await new Promise(function (resolve) {
        const timer = setTimeout(() => resolve("timeout"), 500);
        client.addEventListener("open", function () {
          clearTimeout(timer);
          resolve("connected");
        });
      });
      expect(response).toBe("connected");
      expect(client.readyState).toBe(WebSocket.OPEN);
      await server.stop(true);
    });

    it("getWSContext creates a server on a port passed as an argument", async function () {
      const { server } = getWSContext(0);
      expect(server.port).not.toBe(0);
      await server.stop(true);
    });

    it("getWSContext applies a running server as an argument and returns it", async function () {
      const bunServer = Bun.serve({
        port: 0,
        fetch() { },
        websocket: {
          message() { },
        },
      });

      const { server } = getWSContext(bunServer);
      expect(server).toBe(bunServer);
      await bunServer.stop(true);
    });
  });

  describe("Shutting down WS server", function () {
    it("getWSContext returns a shutdown function that stops server", async function () {
      const { host, shutdown } = getWSContext();
      const client = new WebSocket(host);
      const response = await new Promise(function (resolve) {
        const timer = setTimeout(() => resolve("timeout"), 500);
        client.addEventListener("open", function () {
          clearTimeout(timer);
          resolve("connected");
        });
      });

      expect(response).toBe("connected");
      expect(client.readyState).toBe(WebSocket.OPEN);

      const closedPromise = new Promise(function (resolve) {
        client.addEventListener("close", function () {
          resolve("closed");
        });
        client.addEventListener("error", function () {
          resolve("error");
        })
      });

      await shutdown();
      const closed = await closedPromise;
      expect(closed).toBe("closed");
    });
  });

  describe("Broadcasting", function () {
    it("getWSContext returns a broadcast method for sending messages to clients", async function () {
      const { shutdown, broadcast, host } = getWSContext();
      const client = new WebSocket(host);

      const connected = await new Promise(function (resolve) {
        const timer = setTimeout(function () {
          resolve(false);
        }, 500);

        client.addEventListener("open", function () {
          clearTimeout(timer);
          resolve(true);
        })
        client.addEventListener("error", function () {
          clearTimeout(timer);
          resolve(false);
        })
      });

      expect(connected).toBeTrue();

      const receivedMessage = new Promise(function (resolve) {
        const timer = setTimeout(function () {
          resolve("error");
        }, 500);

        client.addEventListener("message", function (event) {
          clearTimeout(timer);
          const content = event.data;
          resolve(content);
        });
      });

      // NB! Await for ws.subscribe("global")
      // on server to apply to rule out
      // race condition. If subscription
      // on server hasn't been yet applied
      // calling `broadcast` on client will
      // result in nothing.
      Bun.sleep(0);

      const messageSize = broadcast("notification", "Hello");
      expect(messageSize).toBeGreaterThan(0);

      const data = await receivedMessage as string;

      expect(() => JSON.parse(data)).not.toThrow();
      const parsedData = JSON.parse(data);
      expect(parsedData).toEqual({
        type: "notification",
        text: "Hello",
      });

      await shutdown();
    });
  });
});
