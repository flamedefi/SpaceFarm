const TestTrasfer = artifacts.require("farm/FarmBucket");

const { TezosToolkit } = require("@taquito/taquito");
const { InMemorySigner } = require("@taquito/signer");
const { MichelsonMap } = require("@taquito/michelson-encoder");

const { dev, alice } = require("../scripts/sandbox/accounts");

module.exports = async (deployer, _network, accounts) => {
  if (_network === "test") {
    return;
  }

  const flame_token = "KT1Wa8yqRBpFCusJWgcQyjhRz7hUQAmFxW7j";
  const admin = "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb";
  const storage = {
    admin: admin,
    token: "KT1Kmk5VHoNWPUAxapMWv4312HKE4dqWkLSK",
    reward_token: "KT1Kmk5VHoNWPUAxapMWv4312HKE4dqWkLSK",
    config: {
      reward_amount_per_sec: "5",
      mint_rate_permil: "500",
      mint_min_amount: "5",
    },
    accounts: new MichelsonMap(),
    total_stack: "0",
    reward_per_stake: "0",
    last_update_time: "0"

  };

  tezos = new TezosToolkit(tezos.rpc.url);
  tezos.setProvider({
    signer: ["development"].includes(_network)
      ? await InMemorySigner.fromSecretKey(alice.sk)
      : await InMemorySigner.fromSecretKey(dev.sk),
  });

  const operation = await tezos.contract.originate({
    code: JSON.parse(TestTrasfer.michelson),
    storage: storage,
  });

  await operation.confirmation();

  console.log("FarmBucket: ", operation.contractAddress);
};
