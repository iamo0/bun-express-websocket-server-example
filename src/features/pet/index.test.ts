import { afterEach, beforeEach, describe, expect, it, mock as mockFunction } from "bun:test";
import { mock } from "node:test"
import express from "express";
import initPetContext, { PetContextMessage } from ".";
import { ErrorMessage, PET_HUNGER_LIMIT, PET_HUNGER_RATE_PER_TICK, PET_HUNGER_THRESHOLD, TICK_DURATION } from "./pet";

let broadcastFn:(message: string) => void = () => {};

function initServer(port: number = 7530): [string, () => void] {
  broadcastFn = mockFunction((_message: string) => {});
  const { router, dispose } = initPetContext(broadcastFn);

  const app = express();
  app.use(router);

  const server = app.listen(port, function (err) {
    if (err) {
      console.error(err);
      process.exit(1);
    }
  });

  const address = server.address();

  if (address === null) {
    throw new Error("Unable to run tests: server has not started");
  }

  const baseURL = typeof address === "string"
    ? address
    : `http://localhost:${address.port}`;

  return [
    baseURL,
    async function () {
      dispose();
      await new Promise(function(resolve) {
        server.closeAllConnections();
        server.close(function() {
          resolve(true);
        });
      });
    },
  ];
}

let baseURL = ``;
let shutdown = () => {};

beforeEach(function() {
  mock.timers.enable({ apis: ["setInterval", "Date"] });
  [baseURL, shutdown] = initServer(7351);
});

afterEach(async function() {
  await shutdown();
  mock.timers.reset();
});

describe("Pet routing", function () {
  describe("/state", function () {
    it(`/state request for a newly created pet returns 200 and "healthy"`, async function () {
      const response = await fetch(`${baseURL}/state`);
      expect(response.status).toBe(200);

      const responseData = await response.json();
      expect(responseData).toEqual({
        state: "healthy",
      });
    });

    it(`/state request for a pet that hasn't been feed for a while returns 200 and "hungry"`, async function () {
      mock.timers.tick(PET_HUNGER_THRESHOLD / PET_HUNGER_RATE_PER_TICK * TICK_DURATION);

      const response = await fetch(`${baseURL}/state`);
      expect(response.status).toBe(200);

      const responseData = await response.json();
      expect(responseData).toEqual({
        state: "hungry",
      });
    });

    it(`/state request for a pet that hasn't been fed up until its limit returns 200 and "stasis"`, async function () {
      mock.timers.tick(PET_HUNGER_LIMIT / PET_HUNGER_RATE_PER_TICK * TICK_DURATION);

      const response = await fetch(`${baseURL}/state`);
      expect(response.status).toBe(200);

      const responseData = await response.json();
      expect(responseData).toEqual({
        state: "stasis",
      });
    });
  });

  describe("/feed", function() {
    it("/feed request for a newly created pet (still not hungry) returns 409", async function() {
      const response = await fetch(`${baseURL}/feed`);
      expect(response.status).toBe(409);

      const responseData = await response.json();
      expect(responseData).toEqual({
        message: ErrorMessage.NOT_HUNGRY,
      });
    });

    it("/feed request for a pet in stasis returns 409", async function() {
      mock.timers.tick(PET_HUNGER_LIMIT / PET_HUNGER_RATE_PER_TICK * TICK_DURATION);
      const response = await fetch(`${baseURL}/feed`);
      expect(response.status).toBe(409);

      const responseData = await response.json();
      expect(responseData).toEqual({
        message: ErrorMessage.STASIS,
      });
    });

    it("/feed request at appropriate time returns 200 and returns correct state", async function() {
      mock.timers.tick((PET_HUNGER_LIMIT / 10) / PET_HUNGER_RATE_PER_TICK * TICK_DURATION);
      const feedResponse = await fetch(`${baseURL}/feed`);
      expect(feedResponse.status).toBe(200);

      const data = await feedResponse.json();
      expect(data).toEqual({
        state: "healthy",
      });
    });

    it("/feed request for a just fed pet returns 429", async function() {
      mock.timers.tick((PET_HUNGER_LIMIT / 2) / PET_HUNGER_RATE_PER_TICK * TICK_DURATION);
      const feedResponse = await fetch(`${baseURL}/feed`);
      expect(feedResponse.status).toBe(200);

      mock.timers.tick(1);
      const overfeedResponse = await fetch(`${baseURL}/feed`);
      expect(overfeedResponse.status).toBe(429);

      const overfeedResponseData = await overfeedResponse.json();
      expect(overfeedResponseData).toEqual({
        message: ErrorMessage.JUST_FED,
      });
    });

    it("/feed request sends message via broadcast function that the pet has been fed", async function() {
      mock.timers.tick((PET_HUNGER_LIMIT / 2) / PET_HUNGER_RATE_PER_TICK * TICK_DURATION);
      const feedResponse = await fetch(`${baseURL}/feed`);
      expect(feedResponse.status).toBe(200);
      expect(broadcastFn).toHaveBeenCalledWith(PetContextMessage.FED);
    });

    it("/feed request sends message via broadcast function notification about unsuccessful feeding (overfed)", async function() {
      mock.timers.tick((PET_HUNGER_LIMIT / 2) / PET_HUNGER_RATE_PER_TICK * TICK_DURATION);
      const feedResponse = await fetch(`${baseURL}/feed`);
      expect(feedResponse.status).toBe(200);

      mock.timers.tick(2);
      const overfeedResponse = await fetch(`${baseURL}/feed`);
      expect(overfeedResponse.status).toBe(429);
      expect(broadcastFn).toHaveBeenCalledWith(PetContextMessage.JUST_FED);
    });

    it("/feed request sends message via broadcast function notification about unsuccessful feeding (not hungry)", async function() {
      const feedResponse = await fetch(`${baseURL}/feed`);
      expect(feedResponse.status).toBe(409);
      expect(broadcastFn).toHaveBeenCalledWith(PetContextMessage.NOT_HUNGRY);
    });

    it("/feed request sends message via broadcast function notification about unsuccessful feeding (pet is in stasis)", async function() {
      mock.timers.tick(PET_HUNGER_LIMIT / PET_HUNGER_RATE_PER_TICK * TICK_DURATION);
      const feedResponse = await fetch(`${baseURL}/feed`);
      expect(feedResponse.status).toBe(409);
      expect(broadcastFn).toHaveBeenCalledWith(PetContextMessage.STASIS);
    });
  });
});
