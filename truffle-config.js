require("ts-node").register({
  files: true,
});

const { alice, dev } = require("./scripts/sandbox/accounts");

module.exports = {
  contracts_directory: "./contracts/main",

  networks: {
    development: {
      host: "http://localhost",
      port: 8732,
      network_id: "*",
      secretKey: alice.sk,
      type: "tezos",
    },
    test: {
      host: "http://localhost",
      port: 8732,
      network_id: "*",
      secretKey: alice.sk,
      type: "tezos",
    },
    florencenet: {
      host: "https://api.tez.ie/rpc/florencenet",
      port: 443,
      network_id: "*",
      secretKey: dev.sk,
      type: "tezos",
    },
    mainnet: {
      host: "https://mainnet.smartpy.io",
      port: 443,
      network_id: "*",
      secretKey: dev.sk,
      type: "tezos",
    },
  },

  mocha: {
    timeout: 5000000,
  },
};
