import "dotenv/config";
import { createApp } from "./app.js";
import { resolveRuntimeConfig } from "./config.js";

const config = resolveRuntimeConfig();
const app = createApp(config);

app.listen(config.port, config.host, () => {
  console.log(`Hawelly API listening on http://${config.host}:${config.port}`);
});
