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

  // Mainnet must use the complete, human-confirmed Open Book launch flow. A contract-only
  // deploy starts the irreversible 72h clock without adding/burning LP or opening trading.
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  if (chainId === 56) {
    throw new Error(
      "Contract-only mainnet deploy disabled. Run npm run preflight:mainnet, then npm run launch:mainnet."
    );
  }
  const controlWindowSeconds = 60 * 60;

  console.log(`Network:            ${network.name} (chain ${chainId})`);
  console.log(`Deployer:           ${deployer.address}`);
  console.log(
    `Control window:     ${controlWindowSeconds}s (${controlWindowSeconds / 3600}h)`
  );

  const Knife = await ethers.getContractFactory("MacTheKnife");
  const knife = await Knife.deploy(deployer.address, controlWindowSeconds);
  await knife.waitForDeployment();

  const address = await knife.getAddress();
  const supply = await knife.totalSupply();
  const deadline = await knife.controlDeadline();

  console.log(`\n✅ MacTheKnife (KNIFE) deployed`);
  console.log(`   Address:         ${address}`);
  console.log(`   Total supply:    ${ethers.formatUnits(supply, 18)} KNIFE`);
  // Print both forms: the unix value goes in the launch record, the UTC string is what you
  // sanity-check against a calendar before announcing a countdown publicly.
  console.log(`   Control deadline: ${deadline} (unix)`);
  console.log(
    `                     ${new Date(Number(deadline) * 1000).toISOString()} (UTC)`
  );
  console.log(`\nConstructor args (for verification):`);
  console.log(`   ["${deployer.address}", ${controlWindowSeconds}]`);
  console.log(`\nNext: follow DEPLOYMENT.md — add liquidity, exempt the pair, enableTrading, then renounce.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
