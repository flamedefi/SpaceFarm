const Migrations = artifacts.require("Migrations");

module.exports = async (deployer, _network, accounts) => {
  if (_network === "test") {
    return;
  }

  await deployer.deploy(Migrations, {
    last_completed_migration: 0,
    owner: accounts[0],
  });
};
