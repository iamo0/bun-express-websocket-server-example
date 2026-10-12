import express, { Router, type Response } from "express";
import initPetContext from "./features/pet";
import getWSContext from "./ws";
import getFrontendContext from "./features/frontend";

export type HealthcheckStatus = "up" | "degraded" | "down";

export interface GeneralInfoResponse {
  ws_url: string,
}

export interface HealthcheckReport {
  status: HealthcheckStatus,
  componentsRunning: {
    ws: boolean,
  },
}

export default function initServer(port: number = 3000, wsPort: number = 3001) {
  const app = express();
  const router = Router();

  const { middleware: frontendMiddleware } = getFrontendContext();
  app.use(frontendMiddleware);

  const WSContext = getWSContext(wsPort);
  const { shutdown } = WSContext;

  router.get("/api-info", function(_req, res: Response<GeneralInfoResponse>) {
    res.status(200).json({
      "ws_url": WSContext.host,
    });
  });

  router.get("/health", async function (_req, res: Response<HealthcheckReport>) {
    const wsClient = new WebSocket(WSContext.host);
    const status = await new Promise(function(resolve) {
      const timer = setTimeout(function() {
        resolve("timeout");
      }, 500);
      wsClient.addEventListener("open", function() {
        clearTimeout(timer);
        resolve("connected");
      });
      wsClient.addEventListener("error", function() {
        clearTimeout(timer);
        resolve("error");
      });
    })

    res.status(200).json({
      status: status === "connected" ? "up" : "degraded",
      componentsRunning: {
        ws: status === "connected",
      },
    });

    wsClient.close();
  });

  const petContext = initPetContext(function(message: string) {
    WSContext.broadcast("notification", message);
  });
  router.use("/api", petContext.router);

  app.use(router);

  async function close() {
    petContext.dispose();
    await shutdown();
    await new Promise(function(resolve) {
      server.closeAllConnections();
      server.close(function() {
        resolve(true);
      });
    });
  }

  const server = app.listen(port, async function (err) {
    if (err) {
      await close();
      process.exit(1);
    }
  });

  return {
    server,
    wsServer: WSContext.server,
    close,
  };
}
