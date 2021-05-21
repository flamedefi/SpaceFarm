const FA2 = artifacts.require("FA2");

const { MichelsonMap } = require("@taquito/taquito");

module.exports = async (deployer, _network, accounts) => {
  if (_network === "test") {
    return;
  }

  const totalSupply = "310000000000000";
  const paused = false;
  const admin = "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb";
  const minters = [];
  const metadata = MichelsonMap.fromLiteral({
    "": Buffer("tezos-storage:flame", "ascii").toString("hex"),
    flame: Buffer(
      JSON.stringify({
        version: "v0.0.1",
        description: "FLAME Token",
        authors: ["<gromfighter@gmail.com>"],
        source: {
          tools: ["Ligo", "Flextesa"],
          location: "https://ligolang.org/",
        },
        interfaces: ["TZIP-12", "TZIP-16"],
        errors: [],
        views: [],
      }),
      "ascii"
    ).toString("hex"),
  });
  const ledger = MichelsonMap.fromLiteral({
    ["tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb"]: {
      balance: totalSupply,
      allowances: [],
    },
  });
  const tokenMetadata = MichelsonMap.fromLiteral({
    0: {
      token_id: "0",
      token_info: MichelsonMap.fromLiteral({
        symbol: Buffer.from("FLAME").toString("hex"),
        name: Buffer.from("FLAME").toString("hex"),
        decimals: Buffer.from("6").toString("hex"),
        icon: Buffer.from(
          "https://spacefarm.xyz/images/flamelogo.png"
        ).toString("hex"),
      }),
    },
  });
  const storage = {
    total_supply: totalSupply,
    paused: paused,
    admin: admin,
    minters: minters,
    metadata: metadata,
    ledger: ledger,
    token_metadata: tokenMetadata,
  };

  await deployer.deploy(FA2, storage);
};
