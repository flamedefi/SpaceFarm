const { MichelsonMap } = require("@taquito/michelson-encoder");
const { InMemorySigner } = require("@taquito/signer");
const { TezosToolkit } = require("@taquito/taquito");
const { rejects, strictEqual } = require("assert");

const { alice, bob, dev } = require("../scripts/sandbox/accounts");
const { confirmOperation } = require("./helpers/confirmation");

const FA2 = artifacts.require("FA2");

contract("FA2", async () => {
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
        [bob.pkh]: {
          balance: 0,
          allowances: [],
        },
        [dev.pkh]: {
          balance: 0,
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
  });

  it("should transfer", async () => {
    const amount = 50000;
    let storage = await FA2Instance.storage();
    let aliceRecord = await storage.ledger.get(alice.pkh);
    let bobRecord = await storage.ledger.get(bob.pkh);

    strictEqual(aliceRecord.balance.toNumber(), amount * 2);
    strictEqual(bobRecord.balance.toNumber(), 0);

    let transferParams = {
      from_: alice.pkh,
      txs: [
        { to_: bob.pkh, token_id: 0, amount: amount },
        { to_: bob.pkh, token_id: 0, amount: amount },
      ],
    };

    operation = await FA2Instance.methods.transfer([transferParams]).send();

    await confirmOperation(tezos, operation.hash);

    storage = await FA2Instance.storage();
    aliceRecord = await storage.ledger.get(alice.pkh);
    bobRecord = await storage.ledger.get(bob.pkh);

    strictEqual(aliceRecord.balance.toNumber(), 0);
    strictEqual(bobRecord.balance.toNumber(), amount * 2);

    tezos.setProvider({
      signer: await InMemorySigner.fromSecretKey(bob.sk),
    });
    transferParams = {
      from_: bob.pkh,
      txs: [{ to_: alice.pkh, token_id: 0, amount: amount }],
    };

    operation = await FA2Instance.methods
      .transfer([transferParams, transferParams])
      .send();

    await confirmOperation(tezos, operation.hash);

    storage = await FA2Instance.storage();
    aliceRecord = await storage.ledger.get(alice.pkh);
    bobRecord = await storage.ledger.get(bob.pkh);

    strictEqual(aliceRecord.balance.toNumber(), amount * 2);
    strictEqual(bobRecord.balance.toNumber(), 0);
  });

  it("should fail when trasfer with wrong params", async () => {
    operation = await FA2Instance.methods.pause({}).send();

    await confirmOperation(tezos, operation.hash);

    let storage = await FA2Instance.storage();

    strictEqual(storage.paused, true);

    const amount = 50000;
    let transferParams = {
      from_: alice.pkh,
      txs: [{ to_: bob.pkh, token_id: 0, amount: amount }],
    };

    await rejects(
      FA2Instance.methods.transfer([transferParams]).send(),
      (err) => {
        strictEqual(err.message, "FA2_PAUSED", "Error message mismatch");
        return true;
      },
      "Transfer should fail"
    );

    operation = await FA2Instance.methods.unpause({}).send();

    await confirmOperation(tezos, operation.hash);

    storage = await FA2Instance.storage();

    strictEqual(storage.paused, false);

    tezos.setProvider({
      signer: await InMemorySigner.fromSecretKey(bob.sk),
    });

    await rejects(
      FA2Instance.methods.transfer([transferParams]).send(),
      (err) => {
        strictEqual(err.message, "FA2_NOT_OPERATOR", "Error message mismatch");
        return true;
      },
      "Transfer should fail"
    );

    tezos.setProvider({
      signer: await InMemorySigner.fromSecretKey(alice.sk),
    });
    transferParams = {
      from_: alice.pkh,
      txs: [{ to_: bob.pkh, token_id: 1, amount: amount }],
    };

    await rejects(
      FA2Instance.methods.transfer([transferParams]).send(),
      (err) => {
        strictEqual(
          err.message,
          "FA2_TOKEN_UNDEFINED",
          "Error message mismatch"
        );
        return true;
      },
      "Transfer should fail"
    );

    transferParams = {
      from_: alice.pkh,
      txs: [{ to_: bob.pkh, token_id: 0, amount: amount * 3 }],
    };

    await rejects(
      FA2Instance.methods.transfer([transferParams]).send(),
      (err) => {
        strictEqual(
          err.message,
          "FA2_INSUFFICIENT_BALANCE",
          "Error message mismatch"
        );
        return true;
      },
      "Transfer should fail"
    );
  });

  it("should add operator and transfer from", async () => {
    const amount = 50000;
    const updateOperatorParams1 = {
      add_operator: {
        owner: alice.pkh,
        operator: bob.pkh,
        token_id: 0,
      },
    };
    const updateOperatorParams2 = {
      add_operator: {
        owner: alice.pkh,
        operator: dev.pkh,
        token_id: 0,
      },
    };
    let transferParams = {
      from_: alice.pkh,
      txs: [{ to_: bob.pkh, token_id: 0, amount: amount }],
    };

    operation = await FA2Instance.methods
      .update_operators([updateOperatorParams1, updateOperatorParams2])
      .send();

    await confirmOperation(tezos, operation.hash);

    tezos.setProvider({
      signer: await InMemorySigner.fromSecretKey(bob.sk),
    });

    operation = await FA2Instance.methods.transfer([transferParams]).send();

    await confirmOperation(tezos, operation.hash);

    let storage = await FA2Instance.storage();
    let aliceRecord = await storage.ledger.get(alice.pkh);
    let bobRecord = await storage.ledger.get(bob.pkh);

    strictEqual(aliceRecord.balance.toNumber(), amount);
    strictEqual(bobRecord.balance.toNumber(), amount);

    const updateOperatorParams3 = {
      add_operator: {
        owner: bob.pkh,
        operator: alice.pkh,
        token_id: 0,
      },
    };

    operation = await FA2Instance.methods
      .update_operators([updateOperatorParams3])
      .send();

    await confirmOperation(tezos, operation.hash);

    tezos.setProvider({
      signer: await InMemorySigner.fromSecretKey(alice.sk),
    });
    transferParams = {
      from_: bob.pkh,
      txs: [{ to_: alice.pkh, token_id: 0, amount: amount }],
    };

    operation = await FA2Instance.methods.transfer([transferParams]).send();

    await confirmOperation(tezos, operation.hash);

    storage = await FA2Instance.storage();
    aliceRecord = await storage.ledger.get(alice.pkh);
    bobRecord = await storage.ledger.get(bob.pkh);

    strictEqual(aliceRecord.balance.toNumber(), amount * 2);
    strictEqual(bobRecord.balance.toNumber(), 0);
  });

  it("should fail when add operator with wrong params", async () => {
    operation = await FA2Instance.methods.pause({}).send();

    await confirmOperation(tezos, operation.hash);

    let updateOperatorParams = {
      add_operator: {
        owner: alice.pkh,
        operator: bob.pkh,
        token_id: 0,
      },
    };

    await rejects(
      FA2Instance.methods.update_operators([updateOperatorParams]).send(),
      (err) => {
        strictEqual(err.message, "FA2_PAUSED", "Error message mismatch");
        return true;
      },
      "Update operator should fail"
    );

    operation = await FA2Instance.methods.unpause({}).send();

    await confirmOperation(tezos, operation.hash);

    updateOperatorParams.add_operator.token_id = 1;

    await rejects(
      FA2Instance.methods.update_operators([updateOperatorParams]).send(),
      (err) => {
        strictEqual(
          err.message,
          "FA2_TOKEN_UNDEFINED",
          "Error message mismatch"
        );
        return true;
      },
      "Update operator should fail"
    );

    updateOperatorParams.add_operator.token_id = 0;
    tezos.setProvider({
      signer: await InMemorySigner.fromSecretKey(bob.sk),
    });

    await rejects(
      FA2Instance.methods.update_operators([updateOperatorParams]).send(),
      (err) => {
        strictEqual(err.message, "FA2_NOT_OWNER", "Error message mismatch");
        return true;
      },
      "Update operator should fail"
    );
  });

  it("should remove operator and fail transfer from", async () => {
    const amount = 50000;
    const updateOperatorParams1 = {
      add_operator: {
        owner: alice.pkh,
        operator: bob.pkh,
        token_id: 0,
      },
    };
    const updateOperatorParams2 = {
      remove_operator: {
        owner: alice.pkh,
        operator: bob.pkh,
        token_id: 0,
      },
    };
    let transferParams = {
      from_: alice.pkh,
      txs: [{ to_: bob.pkh, token_id: 0, amount: amount }],
    };

    operation = await FA2Instance.methods
      .update_operators([updateOperatorParams1])
      .send(0);

    await confirmOperation(tezos, operation.hash);

    tezos.setProvider({
      signer: await InMemorySigner.fromSecretKey(bob.sk),
    });

    operation = await FA2Instance.methods.transfer([transferParams]).send();

    await confirmOperation(tezos, operation.hash);

    let storage = await FA2Instance.storage();
    let aliceRecord = await storage.ledger.get(alice.pkh);
    let bobRecord = await storage.ledger.get(bob.pkh);

    strictEqual(aliceRecord.balance.toNumber(), amount);
    strictEqual(bobRecord.balance.toNumber(), amount);

    tezos.setProvider({
      signer: await InMemorySigner.fromSecretKey(alice.sk),
    });

    operation = await FA2Instance.methods
      .update_operators([updateOperatorParams2])
      .send();

    await confirmOperation(tezos, operation.hash);

    tezos.setProvider({
      signer: await InMemorySigner.fromSecretKey(bob.sk),
    });

    await rejects(
      FA2Instance.methods.transfer([transferParams]).send(),
      (err) => {
        strictEqual(err.message, "FA2_NOT_OPERATOR", "Error message mismatch");
        return true;
      },
      "Transfer should fail"
    );

    storage = await FA2Instance.storage();
    aliceRecord = await storage.ledger.get(alice.pkh);
    bobRecord = await storage.ledger.get(bob.pkh);

    strictEqual(aliceRecord.balance.toNumber(), amount);
    strictEqual(bobRecord.balance.toNumber(), amount);
  });

  it("should fail when remove operator with wrong params", async () => {
    let updateOperatorParams = {
      add_operator: {
        owner: alice.pkh,
        operator: bob.pkh,
        token_id: 0,
      },
    };

    operation = await FA2Instance.methods
      .update_operators([updateOperatorParams])
      .send();

    await confirmOperation(tezos, operation.hash);

    operation = await FA2Instance.methods.pause({}).send();

    await confirmOperation(tezos, operation.hash);

    updateOperatorParams = {
      remove_operator: {
        owner: alice.pkh,
        operator: bob.pkh,
        token_id: 0,
      },
    };

    await rejects(
      FA2Instance.methods.update_operators([updateOperatorParams]).send(),
      (err) => {
        strictEqual(err.message, "FA2_PAUSED", "Error message mismatch");
        return true;
      },
      "Update operator should fail"
    );

    operation = await FA2Instance.methods.unpause({}).send();

    await confirmOperation(tezos, operation.hash);

    updateOperatorParams.remove_operator.token_id = 1;

    await rejects(
      FA2Instance.methods.update_operators([updateOperatorParams]).send(),
      (err) => {
        strictEqual(
          err.message,
          "FA2_TOKEN_UNDEFINED",
          "Error message mismatch"
        );
        return true;
      },
      "Update operator should fail"
    );

    updateOperatorParams.remove_operator.token_id = 0;
    tezos.setProvider({
      signer: await InMemorySigner.fromSecretKey(bob.sk),
    });

    await rejects(
      FA2Instance.methods.update_operators([updateOperatorParams]).send(),
      (err) => {
        strictEqual(err.message, "FA2_NOT_OWNER", "Error message mismatch");
        return true;
      },
      "Update operator should fail"
    );
  });

  it("should fail when pause with wrong params", async () => {
    operation = await FA2Instance.methods.pause({}).send();

    await confirmOperation(tezos, operation.hash);

    await rejects(
      FA2Instance.methods.pause({}).send(),
      (err) => {
        strictEqual(
          err.message,
          "FA2_ALREADY_PAUSED",
          "Error message mismatch"
        );
        return true;
      },
      "Pause should fail"
    );

    tezos.setProvider({
      signer: await InMemorySigner.fromSecretKey(bob.sk),
    });

    await rejects(
      FA2Instance.methods.pause({}).send(),
      (err) => {
        strictEqual(err.message, "FA2_NOT_ADMIN", "Error message mismatch");
        return true;
      },
      "Pause should fail"
    );
  });

  it("should fail when unpause with wrong params", async () => {
    await rejects(
      FA2Instance.methods.unpause({}).send(),
      (err) => {
        strictEqual(
          err.message,
          "FA2_ALREADY_UNPAUSED",
          "Error message mismatch"
        );
        return true;
      },
      "Unpause should fail"
    );

    tezos.setProvider({
      signer: await InMemorySigner.fromSecretKey(bob.sk),
    });

    await rejects(
      FA2Instance.methods.unpause({}).send(),
      (err) => {
        strictEqual(err.message, "FA2_NOT_ADMIN", "Error message mismatch");
        return true;
      },
      "Unpause should fail"
    );
  });

  it("should change admin or fail", async () => {
    operation = await FA2Instance.methods.change_admin(bob.pkh).send();

    await confirmOperation(tezos, operation.hash);

    const storage = await FA2Instance.storage();

    strictEqual(storage.admin, bob.pkh);

    await rejects(
      FA2Instance.methods.change_admin(alice.pkh).send(),
      (err) => {
        strictEqual(err.message, "FA2_NOT_ADMIN", "Error message mismatch");
        return true;
      },
      "Change admin should fail"
    );
  });

  it("should burn tokens", async () => {
    const amount = 50000;

    operation = await FA2Instance.methods.burn(0, amount).send();

    await confirmOperation(tezos, operation.hash);

    const storage = await FA2Instance.storage();
    const aliceRecord = await storage.ledger.get(alice.pkh);
    const bobRecord = await storage.ledger.get(bob.pkh);

    strictEqual(storage.total_supply.toNumber(), amount);
    strictEqual(aliceRecord.balance.toNumber(), amount);
    strictEqual(bobRecord.balance.toNumber(), 0);
  });

  it("should fail when burn tokens with wrong params", async () => {
    const amount = 50000;

    operation = await FA2Instance.methods.pause({}).send();

    await confirmOperation(tezos, operation.hash);
    await rejects(
      FA2Instance.methods.burn(0, amount).send(),
      (err) => {
        strictEqual(err.message, "FA2_PAUSED", "Error message mismatch");
        return true;
      },
      "Burn should fail"
    );

    operation = await FA2Instance.methods.unpause({}).send();

    await confirmOperation(tezos, operation.hash);
    await rejects(
      FA2Instance.methods.burn(1, amount).send(),
      (err) => {
        strictEqual(
          err.message,
          "FA2_TOKEN_UNDEFINED",
          "Error message mismatch"
        );
        return true;
      },
      "Burn should fail"
    );
    await rejects(
      FA2Instance.methods.burn(0, amount * 3).send(),
      (err) => {
        strictEqual(
          err.message,
          "FA2_INSUFFICIENT_BALANCE",
          "Error message mismatch"
        );
        return true;
      },
      "Burn should fail"
    );
  });

  it("should fail when mint tokens with wrong params", async () => {
    const amount = 50000;
    const updateMinterParams = {
      add_minter: {
        minter: alice.pkh,
        token_id: 0,
      },
    };
    let mintParams = {
      token_id: 0,
      user: alice.pkh,
      amount: amount,
    };

    operation = await FA2Instance.methods.pause({}).send();

    await confirmOperation(tezos, operation.hash);
    await rejects(
      FA2Instance.methods.mint([mintParams]).send(),
      (err) => {
        strictEqual(err.message, "FA2_PAUSED", "Error message mismatch");
        return true;
      },
      "Mint should fail"
    );

    operation = await FA2Instance.methods.unpause({}).send();

    await confirmOperation(tezos, operation.hash);
    await rejects(
      FA2Instance.methods.mint([mintParams]).send(),
      (err) => {
        strictEqual(err.message, "FA2_NOT_MINTER", "Error message mismatch");
        return true;
      },
      "Mint should fail"
    );

    operation = await FA2Instance.methods
      .update_minters([updateMinterParams])
      .send();

    await confirmOperation(tezos, operation.hash);

    mintParams.token_id = 1;

    await rejects(
      FA2Instance.methods.mint([mintParams]).send(),
      (err) => {
        strictEqual(
          err.message,
          "FA2_TOKEN_UNDEFINED",
          "Error message mismatch"
        );
        return true;
      },
      "Mint should fail"
    );
  });

  it("should add minters and mint tokens", async () => {
    const amount = 100000;
    const updateMinterParams1 = {
      add_minter: {
        minter: alice.pkh,
        token_id: 0,
      },
    };
    const updateMinterParams2 = {
      add_minter: {
        minter: bob.pkh,
        token_id: 0,
      },
    };
    const mintParams1 = {
      token_id: 0,
      user: alice.pkh,
      amount: amount,
    };
    const mintParams2 = {
      token_id: 0,
      user: bob.pkh,
      amount: amount,
    };
    const mintParams3 = {
      token_id: 0,
      user: dev.pkh,
      amount: amount,
    };
    let storage = await FA2Instance.storage();
    let aliceRecord = await storage.ledger.get(alice.pkh);
    let bobRecord = await storage.ledger.get(bob.pkh);
    let devRecord = await storage.ledger.get(dev.pkh);

    strictEqual(storage.total_supply.toNumber(), amount);
    strictEqual(aliceRecord.balance.toNumber(), amount);
    strictEqual(bobRecord.balance.toNumber(), 0);
    strictEqual(devRecord.balance.toNumber(), 0);

    operation = await FA2Instance.methods
      .update_minters([updateMinterParams1, updateMinterParams2])
      .send();

    await confirmOperation(tezos, operation.hash);

    operation = await FA2Instance.methods
      .mint([mintParams1, mintParams2, mintParams3])
      .send();

    await confirmOperation(tezos, operation.hash);

    storage = await FA2Instance.storage();
    aliceRecord = await storage.ledger.get(alice.pkh);
    bobRecord = await storage.ledger.get(bob.pkh);
    devRecord = await storage.ledger.get(dev.pkh);

    strictEqual(storage.total_supply.toNumber(), amount * 4);
    strictEqual(aliceRecord.balance.toNumber(), amount * 2);
    strictEqual(bobRecord.balance.toNumber(), amount);
    strictEqual(devRecord.balance.toNumber(), amount);

    tezos.setProvider({
      signer: await InMemorySigner.fromSecretKey(bob.sk),
    });

    operation = await FA2Instance.methods
      .mint([mintParams1, mintParams2, mintParams3])
      .send();

    await confirmOperation(tezos, operation.hash);

    storage = await FA2Instance.storage();
    aliceRecord = await storage.ledger.get(alice.pkh);
    bobRecord = await storage.ledger.get(bob.pkh);
    devRecord = await storage.ledger.get(dev.pkh);

    strictEqual(storage.total_supply.toNumber(), amount * 7);
    strictEqual(aliceRecord.balance.toNumber(), amount * 3);
    strictEqual(bobRecord.balance.toNumber(), amount * 2);
    strictEqual(devRecord.balance.toNumber(), amount * 2);
  });

  it("should fail when add minter with wrong params", async () => {
    let updateMinterParams = {
      add_minter: {
        minter: alice.pkh,
        token_id: 1,
      },
    };

    await rejects(
      FA2Instance.methods.update_minters([updateMinterParams]).send(),
      (err) => {
        strictEqual(
          err.message,
          "FA2_TOKEN_UNDEFINED",
          "Error message mismatch"
        );
        return true;
      },
      "Add minter should fail"
    );

    tezos.setProvider({
      signer: await InMemorySigner.fromSecretKey(bob.sk),
    });
    updateMinterParams.token_id = 0;

    await rejects(
      FA2Instance.methods.update_minters([updateMinterParams]).send(),
      (err) => {
        strictEqual(err.message, "FA2_NOT_ADMIN", "Error message mismatch");
        return true;
      },
      "Add minter should fail"
    );
  });

  it("should fail when remove minter with wrong params", async () => {
    let updateMinterParams = {
      remove_minter: {
        minter: alice.pkh,
        token_id: 1,
      },
    };

    await rejects(
      FA2Instance.methods.update_minters([updateMinterParams]).send(),
      (err) => {
        strictEqual(
          err.message,
          "FA2_TOKEN_UNDEFINED",
          "Error message mismatch"
        );
        return true;
      },
      "Remove minter should fail"
    );

    tezos.setProvider({
      signer: await InMemorySigner.fromSecretKey(bob.sk),
    });
    updateMinterParams.token_id = 0;

    await rejects(
      FA2Instance.methods.update_minters([updateMinterParams]).send(),
      (err) => {
        strictEqual(err.message, "FA2_NOT_ADMIN", "Error message mismatch");
        return true;
      },
      "Remove minter should fail"
    );
  });

  it("should add, remove minter and fail mint tokens", async () => {
    const updateMinterParams1 = {
      add_minter: {
        minter: alice.pkh,
        token_id: 0,
      },
    };
    const updateMinterParams2 = {
      remove_minter: {
        minter: alice.pkh,
        token_id: 0,
      },
    };
    const amount = 50000;
    const mintParams = {
      token_id: 0,
      user: alice.pkh,
      amount: amount,
    };

    operation = await FA2Instance.methods
      .update_minters([updateMinterParams1, updateMinterParams2])
      .send();

    await confirmOperation(tezos, operation.hash);
    await rejects(
      FA2Instance.methods.mint([mintParams]).send(),
      (err) => {
        strictEqual(err.message, "FA2_NOT_MINTER", "Error message mismatch");
        return true;
      },
      "Mint should fail"
    );
  });
});
