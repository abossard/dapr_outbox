import * as path from "node:path";
import express from "express";
import compression from "compression";
import morgan from "morgan";
import { createRequestHandler, type RequestHandler } from "@remix-run/express";
import { broadcastDevReady, installGlobals } from "@remix-run/node";
import sourceMapSupport from "source-map-support";

// patch in Remix runtime globals
installGlobals();
sourceMapSupport.install();

/**
 * @typedef {import('@remix-run/node').ServerBuild} ServerBuild
 */
const BUILD_PATH = path.resolve("./build/index.js");
const WATCH_PATH = path.resolve("./build/version.txt");

/**
 * Initial build
 * @type {ServerBuild}
 */
let build = require(BUILD_PATH);

// We'll make chokidar a dev dependency so it doesn't get bundled in production.
const chokidar =
  process.env.NODE_ENV === "development" ? require("chokidar") : null;

const app = express();

app.use(compression());

// http://expressjs.com/en/advanced/best-practice-security.html#at-a-minimum-disable-x-powered-by-header
app.disable("x-powered-by");

// Remix fingerprints its assets so we can cache forever.
app.use(
  "/build",
  express.static("public/build", { immutable: true, maxAge: "1y" })
);

// Everything else (like favicon.ico) is cached for an hour. You may want to be
// more aggressive with this caching.
app.use(express.static("public", { maxAge: "1h" }));

app.use(morgan("tiny"));

// Check if the server is running in development mode and use the devBuild to reflect realtime changes in the codebase.
app.all(
  "*",
  process.env.NODE_ENV === "development"
    ? createDevRequestHandler()
    : createRequestHandler({
        build,
        mode: process.env.NODE_ENV,
      })
);

const port = process.env.PORT || 3000;

app.listen(port, async () => {
  console.log(`Express server listening on port ${port}`);

  // send "ready" message to dev server
  if (process.env.NODE_ENV === "development") {
    broadcastDevReady(build);
  }
});

// Create a request handler that watches for changes to the server build during development.
function createDevRequestHandler(): RequestHandler {
  async function handleServerUpdate() {
    // 1. re-import the server build
    build = await reimportServer();

    // Add debugger to assist in v2 dev debugging
    if (build?.assets === undefined) {
      console.log(build.assets);
      debugger;
    }

    // 2. tell dev server that this app server is now up-to-date and ready
    broadcastDevReady(build);
  }

  chokidar
    .watch(WATCH_PATH, { ignoreInitial: true })
    .on("add", handleServerUpdate)
    .on("change", handleServerUpdate);

  // wrap request handler to make sure its recreated with the latest build for every request
  return async (req, res, next) => {
    try {
      return createRequestHandler({
        build,
        mode: "development",
      })(req, res, next);
    } catch (error) {
      next(error);
    }
  };
}

// CJS require cache busting
/**
 * @type {() => Promise<ServerBuild>}
 */
async function reimportServer() {
  // 1. manually remove the server build from the require cache
  Object.keys(require.cache).forEach((key) => {
    if (key.startsWith(BUILD_PATH)) {
      delete require.cache[key];
    }
  });

  // 2. re-import the server build
  return require(BUILD_PATH);
}

import { DaprServer,  CommunicationProtocolEnum, DaprClient } from "@dapr/dapr"

const communicationProtocol = (process.env.DAPR_PROTOCOL === "grpc")
  ? CommunicationProtocolEnum.GRPC
  : CommunicationProtocolEnum.HTTP

const daprHost = process.env.DAPR_HOST || "http://localhost";

let daprPort = '3500'
switch (communicationProtocol) {
  case CommunicationProtocolEnum.HTTP: {
    daprPort = process.env.DAPR_HTTP_PORT || '3500'
    break
  }
  case CommunicationProtocolEnum.GRPC: {
    daprPort = process.env.DAPR_GRPC_PORT || '50001'
    break
  }
  default: {
    daprPort = '3500'
  }
}
const serverHost = process.env.SERVER_HOST || "127.0.0.1";
const statestore = "remix_js_state"
const serverPort = process.env.APP_PORT || "5002";
const pubSubName = "remix_js_pubsub";
const pubSubTopic = "orders";


async function subscribe_orders() {
  const server = new DaprServer({
    serverHost,
    serverPort,
    clientOptions: {
      daprHost,
      daprPort,
    },
  });

  // Dapr subscription routes orders topic to this route
  server.pubsub.subscribe(pubSubName, pubSubTopic, async data =>
    console.log("Subscriber received: " + JSON.stringify(data))
  );

  await server.start();
}


async function publish_orders() {
  const client = new DaprClient({ daprHost, daprPort, communicationProtocol });

  for (var i = 1; i <= 10; i++) {
    const order = { orderId: i };

    // Publish an event using Dapr pub/sub
    await client.pubsub.publish(pubSubName, pubSubTopic, order);
    console.log("Published data: " + JSON.stringify(order));

    await sleep(1000);
  }
}
async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}


async function save_orders() {
  const client = new DaprClient({ daprHost, daprPort, communicationProtocol })

  // For each loop, Save order, Get order, and Delete order
  for (let i = 1; i <= 100; i++) {
    const order = { orderId: i.toString() }
    const state =
    {
      key: order.orderId,
      value: Math.floor(Math.random() * (1000 - 1) + 1)
    }

    // Save state into a state store
    console.log("Save data: " + JSON.stringify(state));
    await client.state.transaction(statestore, [
      {
        operation: "upsert",
        request: {
          key: state.key,
          value: state
        }
      }
    ]);

    await sleep(500)
  }
}
subscribe_orders().catch(e => console.error(e));
// publish_orders().catch(e => console.error(e));
save_orders().catch(e => console.error(e));
