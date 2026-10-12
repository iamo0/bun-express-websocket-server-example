import initServer from "./src/init-server";

const { close } = initServer();

process.on("SIGTERM", async function () {
  await close();
  process.exit(0);
});
