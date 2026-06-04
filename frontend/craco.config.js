// craco.config.js
const path = require("path");
const fs = require("fs");
require("dotenv").config();
if (fs.existsSync(path.join(__dirname, ".env.local"))) {
  require("dotenv").config({ path: path.join(__dirname, ".env.local"), override: true });
}

// Local npm start: fix HMR unless using Emergent's HTTPS preview tunnel
const useEmergentTunnel = process.env.USE_EMERGENT_TUNNEL === "true";
if (process.env.NODE_ENV === "development" && !useEmergentTunnel) {
  if (process.env.WDS_SOCKET_PORT === "443") {
    process.env.WDS_SOCKET_PORT = "3000";
  }
  const backend = process.env.REACT_APP_BACKEND_URL || "";
  if (/emergentagent\.com|emergent\.sh/i.test(backend)) {
    process.env.REACT_APP_BACKEND_URL =
      process.env.REACT_APP_BACKEND_URL_LOCAL || "http://127.0.0.1:8001";
  }
}

// Check if we're in development/preview mode (not production build)
// Craco sets NODE_ENV=development for start, NODE_ENV=production for build
const isDevServer = process.env.NODE_ENV !== "production";

// Environment variable overrides
const config = {
  enableHealthCheck: process.env.ENABLE_HEALTH_CHECK === "true",
};

// Conditionally load health check modules only if enabled
let WebpackHealthPlugin;
let setupHealthEndpoints;
let healthPluginInstance;

if (config.enableHealthCheck) {
  WebpackHealthPlugin = require("./plugins/health-check/webpack-health-plugin");
  setupHealthEndpoints = require("./plugins/health-check/health-endpoints");
  healthPluginInstance = new WebpackHealthPlugin();
}

let webpackConfig = {
  eslint: {
    configure: {
      extends: ["plugin:react-hooks/recommended"],
      rules: {
        "react-hooks/rules-of-hooks": "error",
        "react-hooks/exhaustive-deps": "warn",
      },
    },
  },
  webpack: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
    configure: (webpackConfig) => {

      // Add ignored patterns to reduce watched directories
        webpackConfig.watchOptions = {
          ...webpackConfig.watchOptions,
          ignored: [
            '**/node_modules/**',
            '**/.git/**',
            '**/build/**',
            '**/dist/**',
            '**/coverage/**',
            '**/public/**',
        ],
      };

      // Add health check plugin to webpack if enabled
      if (config.enableHealthCheck && healthPluginInstance) {
        webpackConfig.plugins.push(healthPluginInstance);
      }
      return webpackConfig;
    },
  },
};

webpackConfig.devServer = (devServerConfig) => {
  devServerConfig.client = {
    ...devServerConfig.client,
    overlay: {
      ...(typeof devServerConfig.client?.overlay === "object" ? devServerConfig.client.overlay : {}),
      runtimeErrors: (error) => {
        const msg = error?.message || String(error);
        if (/ResizeObserver loop/.test(msg)) return false;
        if (typeof devServerConfig.client?.overlay?.runtimeErrors === "function") {
          return devServerConfig.client.overlay.runtimeErrors(error);
        }
        return true;
      },
    },
  };

  // Add health check endpoints if enabled
  if (config.enableHealthCheck && setupHealthEndpoints && healthPluginInstance) {
    const originalSetupMiddlewares = devServerConfig.setupMiddlewares;

    devServerConfig.setupMiddlewares = (middlewares, devServer) => {
      // Call original setup if exists
      if (originalSetupMiddlewares) {
        middlewares = originalSetupMiddlewares(middlewares, devServer);
      }

      // Setup health endpoints
      setupHealthEndpoints(devServer, healthPluginInstance);

      return middlewares;
    };
  }

  return devServerConfig;
};

// Wrap with visual edits (automatically adds babel plugin, dev server, and overlay in dev mode)
if (isDevServer) {
  try {
    const { withVisualEdits } = require("@emergentbase/visual-edits/craco");
    webpackConfig = withVisualEdits(webpackConfig);
  } catch (err) {
    if (err.code === 'MODULE_NOT_FOUND' && err.message.includes('@emergentbase/visual-edits/craco')) {
      console.warn(
        "[visual-edits] @emergentbase/visual-edits not installed — visual editing disabled."
      );
    } else {
      throw err;
    }
  }
}

module.exports = webpackConfig;
