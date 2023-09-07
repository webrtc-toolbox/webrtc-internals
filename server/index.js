"use strict";

const fs = require("fs");

const ip = require("ip");

const myip = ip.address();

// you'll probably load configuration from config
const cfg = {
  ssl: true,
  port: 8080,
  host: myip,
  ssl_key: "./server/ssl.key",
  ssl_cert: "./server/ssl.crt",
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
    const client = Array.from(wsMap.entries())[0][0];
    if (cache.length > 0) {
      cache.forEach((msg) => {
        // console.log("send cache message", msg.toString());
        client.send(msg.toString());
      });
      cache.length = 0;
    }
    if (client.readyState === 1) {
      // console.log("send message", message.toString());
      client.send(message.toString());
    }
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
