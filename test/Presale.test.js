const { MichelsonMap } = require("@taquito/michelson-encoder");
const { InMemorySigner } = require("@taquito/signer");
const { TezosToolkit } = require("@taquito/taquito");
const { rejects, strictEqual } = require("assert");

const { alice, bob } = require("../scripts/sandbox/accounts");
const { confirmOperation } = require("./helpers/confirmation");

const Presale = artifacts.require("Presale");
const FA2 = artifacts.require("FA2");

contract("Presale", async () => {
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
      total_supply: 50000000000,
      paused: false,
      admin: alice.pkh,
      minters: [],
      metadata: MichelsonMap.fromLiteral({}),
      ledger: MichelsonMap.fromLiteral({
        [alice.pkh]: {
          balance: 50000000000,
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

    const presaleStorage = {
      flame_token: FA2Instance.address,
      flame_price: "1",
      sold_amount: "0",
      presale_end: new Date(Date.parse("2021-05-22T15:00:00")),
      referral_commission: "5",
      last_buyer: "tz1ZZZZZZZZZZZZZZZZZZZZZZZZZZZZNkiRg",
      admin: alice.pkh,
      paused: false,
    };

    operation = await tezos.contract.originate({
      code: JSON.parse(Presale.michelson),
      storage: presaleStorage,
    });

    await confirmOperation(tezos, operation.hash);

    presaleInstance = await tezos.contract.at(operation.contractAddress);

    const amount = 50000000000;
    const transferParams = {
      from_: alice.pkh,
      txs: [{ to_: presaleInstance.address, token_id: 0, amount: amount }],
    };

    operation = await FA2Instance.methods.transfer([transferParams]).send();

    await confirmOperation(tezos, operation.hash);
  });

  it("should pause and unpause or fail if pause and unpause with wrong params", async () => {
    tezos.setProvider({
      signer: await InMemorySigner.fromSecretKey(bob.sk),
    });

    await rejects(
      presaleInstance.methods.pause(true).send(),
      (err) => {
        strictEqual(
          err.message,
          "Presale: not-admin",
          "Error message mismatch"
        );
        return true;
      },
      "Pause should fail"
    );

    tezos.setProvider({
      signer: await InMemorySigner.fromSecretKey(alice.sk),
    });

    operation = await presaleInstance.methods.pause(true).send();

    await confirmOperation(tezos, operation.hash);

    let storage = await presaleInstance.storage();

    strictEqual(storage.paused, true);

    await rejects(
      presaleInstance.methods.pause(true).send(),
      (err) => {
        strictEqual(
          err.message,
          "Presale: already-paused",
          "Error message mismatch"
        );
        return true;
      },
      "Pause should fail"
    );

    operation = await presaleInstance.methods.pause(false).send();

    await confirmOperation(tezos, operation.hash);

    let storage = await presaleInstance.storage();

    strictEqual(storage.paused, false);

    await rejects(
      presaleInstance.methods.pause(false).send(),
      (err) => {
        strictEqual(
          err.message,
          "Presale: already-unpaused",
          "Error message mismatch"
        );
        return true;
      },
      "Pause should fail"
    );
  });

  it("should fail if not admin is trying to change admin", async () => {
    tezos.setProvider({
      signer: await InMemorySigner.fromSecretKey(bob.sk),
    });

    await rejects(
      presaleInstance.methods.changeAdmin(bob.pkh).send(),
      (err) => {
        strictEqual(
          err.message,
          "Presale: not-admin",
          "Error message mismatch"
        );
        return true;
      },
      "Change admin should fail"
    );
  });

  it("should change admin", async () => {
    operation = await presaleInstance.methods.changeAdmin(bob.pkh).send();

    await confirmOperation(tezos, operation.hash);

    const storage = await presaleInstance.storage();

    strictEqual(storage.admin, bob.pkh);
  });

  it("should fail if change referral commission with wrong params", async () => {
    const newCommission = 101;

    tezos.setProvider({
      signer: await InMemorySigner.fromSecretKey(bob.sk),
    });

    await rejects(
      presaleInstance.methods.changeReferralCommission(newCommission).send(),
      (err) => {
        strictEqual(
          err.message,
          "Presale: not-admin",
          "Error message mismatch"
        );
        return true;
      },
      "Change referral commission should fail"
    );

    tezos.setProvider({
      signer: await InMemorySigner.fromSecretKey(alice.sk),
    });

    await rejects(
      presaleInstance.methods.changeReferralCommission(newCommission).send(),
      (err) => {
        strictEqual(
          err.message,
          "Presale: too-high-new-referral-commission",
          "Error message mismatch"
        );
        return true;
      },
      "Change referral commission should fail"
    );
  });

  it("should change referral commission", async () => {
    const newCommission = 20;

    operation = await presaleInstance.methods
      .changeReferralCommission(newCommission)
      .send();

    await confirmOperation(tezos, operation.hash);

    const storage = await presaleInstance.storage();

    strictEqual(storage.referral_commission.toNumber(), newCommission);
  });

  it("should fail if not admin is trying to change flame price", async () => {
    const newFlamePrice = 200;

    tezos.setProvider({
      signer: await InMemorySigner.fromSecretKey(bob.sk),
    });

    await rejects(
      presaleInstance.methods.changeFlamePrice(newFlamePrice).send(),
      (err) => {
        strictEqual(
          err.message,
          "Presale: not-admin",
          "Error message mismatch"
        );
        return true;
      },
      "Change flame price should fail"
    );
  });

  it("should change flame price", async () => {
    const newFlamePrice = 200;

    operation = await presaleInstance.methods
      .changeFlamePrice(newFlamePrice)
      .send();

    await confirmOperation(tezos, operation.hash);

    const storage = await presaleInstance.storage();

    strictEqual(storage.flame_price.toNumber(), newFlamePrice);
  });

  it("should fail if not admin is trying to withdraw XTZ", async () => {
    tezos.setProvider({
      signer: await InMemorySigner.fromSecretKey(bob.sk),
    });

    await rejects(
      presaleInstance.methods.withdrawXTZ(bob.pkh).send(),
      (err) => {
        strictEqual(
          err.message,
          "Presale: not-admin",
          "Error message mismatch"
        );
        return true;
      },
      "Withdraw XTZ should fail"
    );
  });

  it("should fail if trying to burn unsold flames with wrong params", async () => {
    await rejects(
      presaleInstance.methods.burnUnsoldFlames({}).send(),
      (err) => {
        strictEqual(
          err.message,
          "Presale: not-finished-yet",
          "Error message mismatch"
        );
        return true;
      },
      "Burn unsold flames should fail"
    );

    tezos.setProvider({
      signer: await InMemorySigner.fromSecretKey(bob.sk),
    });

    await rejects(
      presaleInstance.methods.burnUnsoldFlames({}).send(),
      (err) => {
        strictEqual(
          err.message,
          "Presale: not-admin",
          "Error message mismatch"
        );
        return true;
      },
      "Burn unsold flames should fail"
    );
  });

  it("should fail if trying to buy flame tokens with wrong params", async () => {
    operation = await presaleInstance.methods.pause(true).send();

    await confirmOperation(tezos, operation.hash);
    await rejects(
      presaleInstance.methods.buy(bob.pkh).send({ amount: 1 }),
      (err) => {
        strictEqual(err.message, "Presale: paused", "Error message mismatch");
        return true;
      },
      "Buy should fail"
    );

    operation = await presaleInstance.methods.pause(false).send();

    await confirmOperation(tezos, operation.hash);
  });

  it("should buy flame tokens 1", async () => {
    operation = await presaleInstance.methods
      .buy(alice.pkh)
      .send({ amount: 1 });

    await confirmOperation(tezos, operation.hash);

    const storage = await presaleInstance.storage();

    strictEqual(storage.last_buyer, alice.pkh);
    strictEqual(storage.sold_amount.toNumber(), 10000000000);

    const FA2storage = await FA2Instance.storage();
    const aliceRecord = await FA2storage.ledger.get(alice.pkh);
    const presaleInstanceRecord = await FA2storage.ledger.get(
      presaleInstance.address
    );

    strictEqual(aliceRecord.balance.toNumber(), 10000000000);
    strictEqual(presaleInstanceRecord.balance.toNumber(), 40000000000);
  });

  it("should buy flame tokens 2", async () => {
    operation = await presaleInstance.methods
      .buy(alice.pkh)
      .send({ amount: 0.6 });

    await confirmOperation(tezos, operation.hash);

    const storage = await presaleInstance.storage();

    strictEqual(storage.last_buyer, alice.pkh);
    strictEqual(storage.sold_amount.toNumber(), 6000000000);

    const FA2storage = await FA2Instance.storage();
    const aliceRecord = await FA2storage.ledger.get(alice.pkh);
    const presaleInstanceRecord = await FA2storage.ledger.get(
      presaleInstance.address
    );

    strictEqual(aliceRecord.balance.toNumber(), 6000000000);
    strictEqual(presaleInstanceRecord.balance.toNumber(), 44000000000);
  });

  it("should buy flame tokens 3", async () => {
    operation = await presaleInstance.methods
      .buy(alice.pkh)
      .send({ amount: 2.6 });

    await confirmOperation(tezos, operation.hash);

    const storage = await presaleInstance.storage();

    strictEqual(storage.last_buyer, alice.pkh);
    strictEqual(storage.sold_amount.toNumber(), 26000000000);

    const FA2storage = await FA2Instance.storage();
    const aliceRecord = await FA2storage.ledger.get(alice.pkh);
    const presaleInstanceRecord = await FA2storage.ledger.get(
      presaleInstance.address
    );

    strictEqual(aliceRecord.balance.toNumber(), 26000000000);
    strictEqual(presaleInstanceRecord.balance.toNumber(), 24000000000);
  });

  it("should buy flame tokens with referral 1", async () => {
    operation = await presaleInstance.methods
      .buy(bob.pkh)
      .send({ amount: 2.6 });

    await confirmOperation(tezos, operation.hash);

    const storage = await presaleInstance.storage();

    strictEqual(storage.last_buyer, alice.pkh);
    strictEqual(storage.sold_amount.toNumber(), 27300000000);

    const FA2storage = await FA2Instance.storage();
    const aliceRecord = await FA2storage.ledger.get(alice.pkh);
    const bobRecord = await FA2storage.ledger.get(bob.pkh);
    const presaleInstanceRecord = await FA2storage.ledger.get(
      presaleInstance.address
    );

    strictEqual(aliceRecord.balance.toNumber(), 26000000000);
    strictEqual(bobRecord.balance.toNumber(), 1300000000);
    strictEqual(presaleInstanceRecord.balance.toNumber(), 22700000000);
  });

  it("should buy flame tokens with referral 2", async () => {
    operation = await presaleInstance.methods.buy(bob.pkh).send({ amount: 1 });

    await confirmOperation(tezos, operation.hash);

    const storage = await presaleInstance.storage();

    strictEqual(storage.last_buyer, alice.pkh);
    strictEqual(storage.sold_amount.toNumber(), 10500000000);

    const FA2storage = await FA2Instance.storage();
    const aliceRecord = await FA2storage.ledger.get(alice.pkh);
    const bobRecord = await FA2storage.ledger.get(bob.pkh);
    const presaleInstanceRecord = await FA2storage.ledger.get(
      presaleInstance.address
    );

    strictEqual(aliceRecord.balance.toNumber(), 10000000000);
    strictEqual(bobRecord.balance.toNumber(), 500000000);
    strictEqual(presaleInstanceRecord.balance.toNumber(), 39500000000);
  });

  it("should buy flame tokens with referral 3", async () => {
    operation = await presaleInstance.methods
      .buy(bob.pkh)
      .send({ amount: 0.6 });

    await confirmOperation(tezos, operation.hash);

    const storage = await presaleInstance.storage();

    strictEqual(storage.last_buyer, alice.pkh);
    strictEqual(storage.sold_amount.toNumber(), 6300000000);

    const FA2storage = await FA2Instance.storage();
    const aliceRecord = await FA2storage.ledger.get(alice.pkh);
    const bobRecord = await FA2storage.ledger.get(bob.pkh);
    const presaleInstanceRecord = await FA2storage.ledger.get(
      presaleInstance.address
    );

    strictEqual(aliceRecord.balance.toNumber(), 6000000000);
    strictEqual(bobRecord.balance.toNumber(), 300000000);
    strictEqual(presaleInstanceRecord.balance.toNumber(), 43700000000);
  });

  it("should withdraw XTZ 1", async () => {
    operation = await presaleInstance.methods
      .buy(alice.pkh)
      .send({ amount: 1 });

    await confirmOperation(tezos, operation.hash);

    let xtzBalance = await tezos.rpc.getBalance(presaleInstance.address);

    strictEqual(xtzBalance.toNumber() / 1000000, 1);

    operation = await presaleInstance.methods.withdrawXTZ(bob.pkh).send();

    await confirmOperation(tezos, operation.hash);

    xtzBalance = await tezos.rpc.getBalance(presaleInstance.address);

    strictEqual(xtzBalance.toNumber(), 0);
  });

  it("should withdraw XTZ 2", async () => {
    operation = await presaleInstance.methods
      .buy(alice.pkh)
      .send({ amount: 1 });

    await confirmOperation(tezos, operation.hash);

    tezos.setProvider({
      signer: await InMemorySigner.fromSecretKey(bob.sk),
    });

    operation = await presaleInstance.methods
      .buy(alice.pkh)
      .send({ amount: 2 });

    await confirmOperation(tezos, operation.hash);

    tezos.setProvider({
      signer: await InMemorySigner.fromSecretKey(alice.sk),
    });

    let xtzBalance = await tezos.rpc.getBalance(presaleInstance.address);

    strictEqual(xtzBalance.toNumber() / 1000000, 3);

    operation = await presaleInstance.methods.withdrawXTZ(bob.pkh).send();

    await confirmOperation(tezos, operation.hash);

    xtzBalance = await tezos.rpc.getBalance(presaleInstance.address);

    strictEqual(xtzBalance.toNumber(), 0);
  });

  it("should burn unsold flame tokens", async () => {
    const amount = 50000000000;
    const FA2Storage = {
      total_supply: amount,
      paused: false,
      admin: alice.pkh,
      minters: [],
      metadata: MichelsonMap.fromLiteral({}),
      ledger: MichelsonMap.fromLiteral({
        [alice.pkh]: {
          balance: amount,
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

    const presaleStorage = {
      flame_token: FA2Instance.address,
      flame_price: "1",
      sold_amount: "0",
      presale_end: new Date(Date.parse("2020-05-22T15:00:00")),
      referral_commission: "5",
      last_buyer: "tz1ZZZZZZZZZZZZZZZZZZZZZZZZZZZZNkiRg",
      admin: alice.pkh,
      paused: false,
    };

    operation = await tezos.contract.originate({
      code: JSON.parse(Presale.michelson),
      storage: presaleStorage,
    });

    await confirmOperation(tezos, operation.hash);

    presaleInstance = await tezos.contract.at(operation.contractAddress);

    const transferParams = {
      from_: alice.pkh,
      txs: [{ to_: presaleInstance.address, token_id: 0, amount: amount }],
    };

    operation = await FA2Instance.methods.transfer([transferParams]).send();

    await confirmOperation(tezos, operation.hash);

    let FA2storage = await FA2Instance.storage();
    let presaleInstanceRecord = await FA2storage.ledger.get(
      presaleInstance.address
    );

    strictEqual(presaleInstanceRecord.balance.toNumber(), amount);

    operation = await presaleInstance.methods.burnUnsoldFlames({}).send();

    await confirmOperation(tezos, operation.hash);

    FA2storage = await FA2Instance.storage();
    presaleInstanceRecord = await FA2storage.ledger.get(
      presaleInstance.address
    );

    strictEqual(presaleInstanceRecord.balance.toNumber(), 0);
  });
});
