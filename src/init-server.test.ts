import { afterAll, beforeAll, describe, expect, it } from "bun:test"
import type { Server } from "http";
import initServer from "./init-server";

let server:Server | null = null;
let wsServer: ReturnType<typeof Bun.serve> | null = null;
let baseURL = ``;
let closeFn = () => {};

beforeAll(function() {
  const serverData = initServer(7357, 7358);
  server = serverData.server;
  closeFn = serverData.close;
  wsServer = serverData.wsServer;
  const address = server.address();

  if (address === null) {
    throw new Error("Unable to run tests: server has not started");
  }

  baseURL = typeof address === "string"
    ? address
    : `http://localhost:${address.port}`;
});

afterAll(async function() {
  await closeFn();
});

describe("Global behaviour", function() {
  describe("Welcome handle", function() {
    it("/ returns a JSON containing additional data like url to connect to WS server", async function() {
      const response = await fetch(`${baseURL}/`);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data).toEqual({
        ws_url: `http://localhost:7358/ws`,
      });
    });
  });

  describe("Server healthcheck", function() {
    it("/health returns 200 and shows that WS is running", async function() {
      const response = await fetch(`${baseURL}/health`);
      expect(response.status).toBe(200);

      const responseData = await response.json();
      expect(responseData).toEqual({
        status: "up",
        componentsRunning: {
          ws: true,
        },
      });
    });

    it("If WS is down for some reason /health will show it", async function() {
      await wsServer!.stop();
      const response = await fetch(`${baseURL}/health`);
      expect(response.status).toBe(200);

      const responseData = await response.json();
      expect(responseData).toEqual({
        status: "degraded",
        componentsRunning: {
          ws: false,
        },
      });
    });
  });
});
