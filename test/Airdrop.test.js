const { MichelsonMap } = require("@taquito/michelson-encoder");
const { InMemorySigner } = require("@taquito/signer");
const { TezosToolkit } = require("@taquito/taquito");
const { rejects, strictEqual } = require("assert");

const { alice, bob, dev } = require("../scripts/sandbox/accounts");
const { confirmOperation } = require("./helpers/confirmation");

const Airdrop = artifacts.require("Airdrop");
const FA2 = artifacts.require("FA2");

contract("Airdrop", async () => {
  var operation;

  beforeEach("setup", async () => {
    tezos = new TezosToolkit(tezos.rpc.url);
    tezos.setProvider({
      config: {
        confirmationPollingTimeoutSecond: 50000,
      },
      signer: await InMemorySigner.fromSecretKey(alice.sk),
    });

    const FA2Storage = {
      total_supply: 100000,
      paused: false,
      admin: alice.pkh,
      minters: [],
      metadata: MichelsonMap.fromLiteral({}),
      ledger: MichelsonMap.fromLiteral({
        [alice.pkh]: {
          balance: 100000,
          allowances: [],
        },
      }),
      token_metadata: MichelsonMap.fromLiteral({}),
    };

    operation = await tezos.contract.originate({
      code: JSON.parse(FA2.michelson),
      storage: FA2Storage,
    });

    await confirmOperation(tezos, operation.hash);

    FA2Instance = await tezos.contract.at(operation.contractAddress);

    const airdropStorage = {
      flame_token: FA2Instance.address,
      admin: alice.pkh,
      recipients: [],
    };

    operation = await tezos.contract.originate({
      code: JSON.parse(Airdrop.michelson),
      storage: airdropStorage,
    });

    await confirmOperation(tezos, operation.hash);

    airdropInstance = await tezos.contract.at(operation.contractAddress);
  });

  it("should fail if not admin is trying to change admin", async () => {
    tezos.setProvider({
      signer: await InMemorySigner.fromSecretKey(bob.sk),
    });

    await rejects(
      airdropInstance.methods.changeAdmin(bob.pkh).send(),
      (err) => {
        strictEqual(
          err.message,
          "Airdrop: not-admin",
          "Error message mismatch"
        );
        return true;
      },
      "Change admin should fail"
    );
  });

  it("should change admin", async () => {
    operation = await airdropInstance.methods.changeAdmin(bob.pkh).send();

    await confirmOperation(tezos, operation.hash);

    const storage = await airdropInstance.storage();

    strictEqual(storage.admin, bob.pkh);
  });

  it("should fail if not admin is trying to make airdrop", async () => {
    tezos.setProvider({
      signer: await InMemorySigner.fromSecretKey(bob.sk),
    });

    await rejects(
      airdropInstance.methods.makeAirdrop([bob.pkh, dev.pkh]).send(),
      (err) => {
        strictEqual(
          err.message,
          "Airdrop: not-admin",
          "Error message mismatch"
        );
        return true;
      },
      "Make airdrop should fail"
    );
  });

  it("should make airdrop 1", async () => {
    const amount = 50000;
    const transferParams = {
      from_: alice.pkh,
      txs: [{ to_: airdropInstance.address, token_id: 0, amount: amount }],
    };

    operation = await FA2Instance.methods.transfer([transferParams]).send();

    await confirmOperation(tezos, operation.hash);

    let FA2Storage = await FA2Instance.storage();
    let aliceRecord = await FA2Storage.ledger.get(alice.pkh);
    let airdropRecord = await FA2Storage.ledger.get(airdropInstance.address);

    strictEqual(aliceRecord.balance.toNumber(), amount);
    strictEqual(airdropRecord.balance.toNumber(), amount);

    operation = await airdropInstance.methods
      .makeAirdrop([bob.pkh, dev.pkh])
      .send();

    await confirmOperation(tezos, operation.hash);

    const storage = await airdropInstance.storage();

    strictEqual(storage.recipients.length, 0);

    FA2Storage = await FA2Instance.storage();
    aliceRecord = await FA2Storage.ledger.get(alice.pkh);
    airdropRecord = await FA2Storage.ledger.get(airdropInstance.address);

    const bobRecord = await FA2Storage.ledger.get(bob.pkh);
    const devRecord = await FA2Storage.ledger.get(dev.pkh);

    strictEqual(aliceRecord.balance.toNumber(), amount);
    strictEqual(airdropRecord.balance.toNumber(), 0);
    strictEqual(bobRecord.balance.toNumber(), amount / 2);
    strictEqual(devRecord.balance.toNumber(), amount / 2);
  });

  it("should make airdrop 2", async () => {
    const amount = 100000;
    const transferParams = {
      from_: alice.pkh,
      txs: [{ to_: airdropInstance.address, token_id: 0, amount: amount }],
    };

    operation = await FA2Instance.methods.transfer([transferParams]).send();

    await confirmOperation(tezos, operation.hash);

    let FA2Storage = await FA2Instance.storage();
    let aliceRecord = await FA2Storage.ledger.get(alice.pkh);
    let airdropRecord = await FA2Storage.ledger.get(airdropInstance.address);

    strictEqual(aliceRecord.balance.toNumber(), 0);
    strictEqual(airdropRecord.balance.toNumber(), amount);

    operation = await airdropInstance.methods
      .makeAirdrop([alice.pkh, bob.pkh, dev.pkh])
      .send();

    await confirmOperation(tezos, operation.hash);

    const storage = await airdropInstance.storage();

    strictEqual(storage.recipients.length, 0);

    FA2Storage = await FA2Instance.storage();
    aliceRecord = await FA2Storage.ledger.get(alice.pkh);
    airdropRecord = await FA2Storage.ledger.get(airdropInstance.address);

    const bobRecord = await FA2Storage.ledger.get(bob.pkh);
    const devRecord = await FA2Storage.ledger.get(dev.pkh);

    strictEqual(airdropRecord.balance.toNumber(), 1);
    strictEqual(aliceRecord.balance.toNumber(), Math.floor(amount / 3));
    strictEqual(bobRecord.balance.toNumber(), Math.floor(amount / 3));
    strictEqual(devRecord.balance.toNumber(), Math.floor(amount / 3));
  });
});
