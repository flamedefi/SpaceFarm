const Presale = artifacts.require("Presale");

const { TezosToolkit } = require("@taquito/taquito");
const { InMemorySigner } = require("@taquito/signer");

const { dev, alice } = require("../scripts/sandbox/accounts");

module.exports = async (deployer, _network, accounts) => {
  if (_network === "test") {
    return;
  }

  const flame_token = "KT1Wa8yqRBpFCusJWgcQyjhRz7hUQAmFxW7j";
  const flame_price = "1"; // 1 XTZ, 1000000 mutez = 10000 Flames
  const sold_amount = "0";
  const presale_end = new Date(Date.parse("2021-05-22T15:00:00"));
  const referral_commission = "5";
  const last_buyer = "tz1ZZZZZZZZZZZZZZZZZZZZZZZZZZZZNkiRg";
  const admin = "tz1YtUbTURpWeX1CzHFamxS7fGdaKwKKgMzq";
  const paused = false;
  const storage = {
    flame_token: flame_token,
    flame_price: flame_price,
    sold_amount: sold_amount,
    presale_end: presale_end,
    referral_commission: referral_commission,
    last_buyer: last_buyer,
    admin: admin,
    paused: paused,
  };

  tezos = new TezosToolkit(tezos.rpc.url);
  tezos.setProvider({
    signer: ["development"].includes(_network)
      ? await InMemorySigner.fromSecretKey(alice.sk)
      : await InMemorySigner.fromSecretKey(dev.sk),
  });

  const operation = await tezos.contract.originate({
    code: JSON.parse(Presale.michelson),
    storage: storage,
  });

  await operation.confirmation();

  console.log("Presale: ", operation.contractAddress);
};
