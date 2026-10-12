import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test"
import { mock } from "node:test"
import type { Server } from "http";
import initServer from "./init-server";
import { PET_HUNGER_LIMIT, PET_HUNGER_RATE_PER_TICK, TICK_DURATION } from "./features/pet/pet";
import { PetContextMessage } from "./features/pet";

let server: Server | null = null;
let wsServer: ReturnType<typeof Bun.serve> | null = null;
let baseURL = ``;
let closeFn = () => { };

beforeEach(async function () {
  mock.timers.enable({ apis: ["setInterval", "Date"] });

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

afterEach(async function () {
  await closeFn();
  mock.timers.reset();
});

describe("Global behaviour", function () {
  describe("Frontend", function () {
    it("/ returns HTML", async function () {
      const response = await fetch(`${baseURL}/`);
      expect(response.status).toBe(200);

      const contentType = response.headers.get("content-type") ?? "";
      expect(contentType).toContain("text/html");
    });

    it("unknown path returns 404", async function () {
      const response = await fetch(`${baseURL}/nope`);
      expect(response.status).toBe(404);
    });
  });

  describe("Welcome handle", function () {
    it("/api-info returns a JSON containing additional data like url to connect to WS server", async function () {
      const response = await fetch(`${baseURL}/api-info`);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data).toEqual({
        ws_url: `http://localhost:7358/ws`,
      });
    });
  });

  describe("Server healthcheck", function () {
    it("/health returns 200 and shows that WS is running", async function () {
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

    it("If WS is down for some reason /health will show it", async function () {
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

  describe("Pet and WS server integration", function () {
    async function getWS() {
      const wss = wsServer!;
      const { protocol, hostname, port } = wss;
      const ws = new WebSocket(`${protocol}://${hostname}:${port}/ws`);
      const connectionStatus = await new Promise(function (resolve) {
        const timer = setTimeout(function () {
          resolve("timeout");
        }, 500);
        ws.addEventListener("open", function () {
          clearTimeout(timer);
          resolve("connected");
        })
        ws.addEventListener("error", function () {
          clearTimeout(timer);
          resolve("error");
        });
      });

      expect(connectionStatus).toBe("connected");
      return ws;
    }

    function getMessage(ws: WebSocket, predicate: (data: string) => boolean = (_data: string) => true) {
      return new Promise(function (resolve) {
        const timer = setTimeout(function () {
          resolve("error");
        }, 500);
        ws.addEventListener("message", function (event) {
          if (predicate(event.data as string)) {
            clearTimeout(timer);
            try {
              const data = JSON.parse(event.data);
              resolve(data);
            } catch(_err) {
              resolve("error");
            }
          }
        });
      });
    }

    it("Successful feeding request sends a notification via WS server", async function () {
      const ws = await getWS();

      mock.timers.tick((PET_HUNGER_LIMIT / 10) / PET_HUNGER_RATE_PER_TICK * TICK_DURATION);
      const feedResponse = await fetch(`${baseURL}/api/feed`);
      expect(feedResponse.status).toBe(200);

      const wsMessage = await getMessage(ws);
      expect(wsMessage).not.toBe("error");
      expect(wsMessage).toEqual({
        type: "notification",
        text: PetContextMessage.FED,
      });
    });

    it("Unsuccessful feeding request (not hungry) sends a notification via WS server", async function () {
      const ws = await getWS();

      const feedResponse = await fetch(`${baseURL}/api/feed`);
      expect(feedResponse.status).toBe(409);

      const wsMessage = await getMessage(ws);
      expect(wsMessage).not.toBe("error");
      expect(wsMessage).toEqual({
        type: "notification",
        text: PetContextMessage.NOT_HUNGRY,
      });
    });

    it("Unsuccessful feeding request (too often) send a notification via WS server", async function () {
      const ws = await getWS();
      const messagePromise = getMessage(ws, (data) => data.includes(PetContextMessage.JUST_FED));

      mock.timers.tick((PET_HUNGER_LIMIT / 2) / PET_HUNGER_RATE_PER_TICK * TICK_DURATION);
      const feedResponse = await fetch(`${baseURL}/api/feed`);
      expect(feedResponse.status).toBe(200);

      mock.timers.tick(2);
      const overfeedResponse = await fetch(`${baseURL}/api/feed`);
      expect(overfeedResponse.status).toBe(429);

      const wsMessage = await messagePromise;
      expect(wsMessage).toEqual({
        type: "notification",
        text: PetContextMessage.JUST_FED,
      });
    });
  });
});
