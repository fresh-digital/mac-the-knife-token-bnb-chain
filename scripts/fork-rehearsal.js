/**
 * Exact Open Book launch rehearsal against PancakeSwap V2 on a BSC mainnet fork.
 * No real funds or private keys are used.
 *
 * Exercises:
 *   1. Deploy KNIFE with the published 72h Deadhand
 *   2. Put 100% of supply + 10 BNB into KNIFE/BNB
 *   3. Exempt pair/router and set the published 1% launch cap
 *   4. Enable trading, burn every deployer LP token, and renounce ownership
 *   5. Buy, burn, and sell from a second wallet
 *   6. Cross the Deadhand deadline and prove holder transfers remain live
 */
const hre = require("hardhat");
const { ethers } = hre;
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const {
  PAIR_ABI,
  executeOpenBookLaunch,
} = require("./lib/open-book-launch");

const SWAP_ROUTER_ABI = [
  "function WETH() view returns (address)",
  "function swapExactETHForTokensSupportingFeeOnTransferTokens(uint amountOutMin,address[] path,address to,uint deadline) payable",
  "function swapExactTokensForETHSupportingFeeOnTransferTokens(uint amountIn,uint amountOutMin,address[] path,address to,uint deadline)",
];

function assert(condition, message) {
  if (!condition) throw new Error(`REHEARSAL FAILED: ${message}`);
}

async function main() {
  if (process.env.FORK !== "true") {
    throw new Error("Run with FORK=true so Hardhat forks BSC mainnet.");
  }

  const checkpoints = [];
  const record = await executeOpenBookLaunch(hre, {
    verifySource: false,
    onCheckpoint(checkpoint) {
      checkpoints.push(checkpoint);
    },
  });
  const [, buyer, carol] = await ethers.getSigners();
  const knife = await ethers.getContractAt("MacTheKnife", record.token);
  const router = new ethers.Contract(
    record.router,
    SWAP_ROUTER_ABI,
    buyer
  );
  const pair = new ethers.Contract(record.pair, PAIR_ABI, buyer);
  const wbnb = await router.WETH();
  const deadline = async () => (await time.latest()) + 1_200;
  const expectedTransactions = [
    "deployment",
    "approval",
    "addLiquidity",
    "pairExemption",
    "routerExemption",
    "maxWallet",
    "enableTrading",
    "burnLp",
    "renounceOwnership",
  ];
  for (const transaction of expectedTransactions) {
    assert(
      checkpoints.some(
        (checkpoint) =>
          checkpoint.event === "transaction-broadcast" &&
          checkpoint.transaction === transaction
      ),
      `journal missed ${transaction} broadcast`
    );
    assert(
      checkpoints.some(
        (checkpoint) =>
          checkpoint.event === "transaction-confirmed" &&
          checkpoint.transaction === transaction
      ),
      `journal missed ${transaction} confirmation`
    );
  }
  assert(
    checkpoints.some(
      (checkpoint) =>
        checkpoint.event === "transaction-broadcast" &&
        checkpoint.transaction === "deployment" &&
        checkpoint.token === record.token
    ),
    "journal cannot recover the deployed token address"
  );
  console.log("8) Every launch transaction was durably checkpointable.");

  assert((await knife.owner()) === ethers.ZeroAddress, "owner was not renounced");
  assert(
    (await pair.balanceOf(record.deployer)) === 0n,
    "deployer retained LP tokens"
  );
  assert(
    (await pair.balanceOf(record.lpBurnAddress)) > 0n,
    "burn address holds no LP tokens"
  );
  console.log("9) Ownership renounced and deployer LP balance is zero.");

  const buyBnb = ethers.parseEther("0.05");
  await (
    await router.swapExactETHForTokensSupportingFeeOnTransferTokens(
      0,
      [wbnb, record.token],
      buyer.address,
      await deadline(),
      { value: buyBnb }
    )
  ).wait();
  const bought = await knife.balanceOf(buyer.address);
  assert(bought > 0n, "buy returned zero KNIFE");
  assert(bought <= BigInt(record.maxWallet), "buy bypassed the 1% max wallet");
  console.log(`10) Buy OK: 0.05 BNB -> ${ethers.formatUnits(bought, 18)} KNIFE.`);

  const burnAmount = bought / 4n;
  const supplyBefore = await knife.totalSupply();
  await (await knife.connect(buyer).burn(burnAmount)).wait();
  assert(
    (await knife.totalSupply()) === supplyBefore - burnAmount,
    "holder burn did not reduce supply"
  );
  console.log("11) Holder burn reduced total supply.");

  const sellAmount = bought / 2n;
  const bnbBefore = await ethers.provider.getBalance(buyer.address);
  await (await knife.connect(buyer).approve(record.router, sellAmount)).wait();
  await (
    await router.swapExactTokensForETHSupportingFeeOnTransferTokens(
      sellAmount,
      0,
      [record.token, wbnb],
      buyer.address,
      await deadline()
    )
  ).wait();
  const bnbAfter = await ethers.provider.getBalance(buyer.address);
  assert(bnbAfter > bnbBefore, "sell returned no BNB");
  console.log("12) Sell OK: KNIFE returned BNB after LP burn and renunciation.");

  const holderRemainder = await knife.balanceOf(buyer.address);
  assert(holderRemainder > 0n, "buyer has no KNIFE left for liveness proof");
  await time.increaseTo((await knife.controlDeadline()) + 1n);
  await (
    await knife.connect(buyer).transfer(carol.address, holderRemainder)
  ).wait();
  assert(
    (await knife.balanceOf(carol.address)) === holderRemainder,
    "post-deadline holder transfer did not land"
  );
  assert((await knife.status()).controlWindowOpen_ === false, "Deadhand did not fire");
  console.log("13) Deadhand fired; holder-to-holder transfer remains live.");

  console.log(
    "\nREHEARSAL PASSED — the exact Open Book profile deploys, seeds liquidity, " +
      "burns LP, renounces, buys, burns, sells, and remains live after the Cut."
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
