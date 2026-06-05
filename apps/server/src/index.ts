import { buildServer } from "./app.js";
import { loadEnv } from "./env.js";

const env = loadEnv();
const server = await buildServer(env);

try {
  await server.app.listen({ port: env.port, host: "0.0.0.0" });
} catch (error) {
  server.app.log.error(error);
  process.exit(1);
}
