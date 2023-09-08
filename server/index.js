"use strict";

const fs = require("fs");

const ip = require("ip");

const myip = ip.address();

// you'll probably load configuration from config
const cfg = {
  ssl: true,
  port: 8043,
  host: myip,
  ssl_key: "./ssl.key",
  ssl_cert: "./ssl.crt",
};

const httpServ = cfg.ssl ? require("https") : require("http");

const WebSocketServer = require("ws").Server;

let app = null;

// dummy request processing
const processRequest = () => {};

if (cfg.ssl) {
  app = httpServ
    .createServer(
      {
        // providing server with  SSL key/cert
        key: fs.readFileSync(cfg.ssl_key),
        cert: fs.readFileSync(cfg.ssl_cert),
      },
      processRequest
    )
    .listen({
      host: cfg.host,
      port: cfg.port,
    });
} else {
  app = httpServ.createServer(processRequest).listen(cfg.port);
}

// passing or reference to web server so WS would knew port and SSL capabilities
const wss = new WebSocketServer({
  server: app,
});

const wsMap = new Map();
wss.on("connection", function (wsConnect) {
  console.log(`new connection, current client size is ${wss.clients.size}`);
  const cache = [];
  wsConnect.on("message", function (message) {
    if (message.toString() === "receive") {
      wsMap.set(wsConnect, true);
      return;
    }
    if (wsMap.size === 0) {
      cache.push(message);
      return;
    }

    cache.forEach((msg) => {
      Array.from(wsMap.entries()).forEach(([client, _]) => {
        if (client.readyState === 1) {
          // console.log("send message", message.toString());
          client.send(msg.toString());
        }
      });
    });
    cache.length = 0;

    Array.from(wsMap.entries()).forEach(([client, _]) => {
      if (client.readyState === 1) {
        // console.log("send message", message.toString());
        client.send(message.toString());
      }
    });
  });
  wsConnect.on("close", function () {
    console.log(`close connection, current client size is ${wss.clients.size}`);
    if (wsMap.get(wsConnect)) {
      wsMap.clear();
    }
  });
});

console.log(
  `start server, listen host: ${cfg.host}, port: ${cfg.port}, you can use ${
    cfg.ssl ? "wss" : "ws"
  }://${cfg.host}:${cfg.port} to connect`
);
