const Airdrop = artifacts.require("Airdrop");

const { TezosToolkit } = require("@taquito/taquito");
const { InMemorySigner } = require("@taquito/signer");

const { dev, alice } = require("../scripts/sandbox/accounts");

module.exports = async (deployer, _network, accounts) => {
  if (_network === "test") {
    return;
  }

  const flame_token = "KT1Wa8yqRBpFCusJWgcQyjhRz7hUQAmFxW7j";
  const admin = "tz1YtUbTURpWeX1CzHFamxS7fGdaKwKKgMzq";
  const storage = {
    flame_token: flame_token,
    admin: admin,
    recipients: [],
  };

  tezos = new TezosToolkit(tezos.rpc.url);
  tezos.setProvider({
    signer: ["development"].includes(_network)
      ? await InMemorySigner.fromSecretKey(alice.sk)
      : await InMemorySigner.fromSecretKey(dev.sk),
  });

  const operation = await tezos.contract.originate({
    code: JSON.parse(Airdrop.michelson),
    storage: storage,
  });

  await operation.confirmation();

  console.log("Airdrop: ", operation.contractAddress);
};
