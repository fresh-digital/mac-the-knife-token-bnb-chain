const hre = require("hardhat");

// Deploys MacTheKnife (KNIFE). The deployer receives 100% of supply so it can seed
// liquidity; the Deadhand Cut then strips its powers automatically at the deadline.
async function main() {
  const { ethers, network } = hre;
  const [deployer] = await ethers.getSigners();

  if (!deployer) {
    throw new Error(
      "No signer. Set PRIVATE_KEY in .env before deploying to a live network."
    );
  }

  // Control window: how long the deployer keeps launch powers before the token
  // auto-renounces forever. 72h on mainnet; short on testnet/local for fast demos.
  const THREE_DAYS = 3 * 24 * 60 * 60;
  const controlWindowSeconds = network.name === "bsc" ? THREE_DAYS : 60 * 60;

  console.log(`Network:            ${network.name}`);
  console.log(`Deployer:           ${deployer.address}`);
  console.log(`Control window:     ${controlWindowSeconds}s`);

  const Knife = await ethers.getContractFactory("MacTheKnife");
  const knife = await Knife.deploy(deployer.address, controlWindowSeconds);
  await knife.waitForDeployment();

  const address = await knife.getAddress();
  const supply = await knife.totalSupply();
  const deadline = await knife.controlDeadline();

  console.log(`\n✅ MacTheKnife (KNIFE) deployed`);
  console.log(`   Address:         ${address}`);
  console.log(`   Total supply:    ${ethers.formatUnits(supply, 18)} KNIFE`);
  console.log(`   Control deadline:${deadline} (unix)`);
  console.log(`\nConstructor args (for verification):`);
  console.log(`   ["${deployer.address}", ${controlWindowSeconds}]`);
  console.log(`\nNext: follow DEPLOYMENT.md — add liquidity, exempt the pair, enableTrading, then renounce.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
