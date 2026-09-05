const path = require("node:path");

const repositoryRoot = __dirname;

module.exports = {
  apps: [
    {
      name: "hawelly-api",
      cwd: path.join(repositoryRoot, "apps", "api"),
      script: path.join(repositoryRoot, "apps", "api", "dist", "src", "index.js"),
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      max_memory_restart: "512M",
      kill_timeout: 10_000,
      listen_timeout: 10_000,
      time: true
    },
    {
      name: "hawelly-web",
      cwd: path.join(repositoryRoot, "apps", "web"),
      script: path.join(repositoryRoot, "node_modules", "next", "dist", "bin", "next"),
      args: "start --hostname 127.0.0.1",
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      max_memory_restart: "512M",
      kill_timeout: 10_000,
      listen_timeout: 10_000,
      time: true
    }
  ]
};
