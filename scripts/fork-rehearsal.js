/**
 * Full launch rehearsal for MacTheKnife (KNIFE) on a forked BSC mainnet.
 * No real funds or private keys required.
 *
 *   PowerShell:  $env:FORK="true"; npx hardhat run scripts/fork-rehearsal.js
 *   bash:        FORK=true npx hardhat run scripts/fork-rehearsal.js
 *
 * Exercises the exact mainnet launch sequence against the REAL PancakeSwap v2
 * router, then proves the Deadhand Cut end to end:
 *   1. Deploy with a short control window
 *   2. Add KNIFE/BNB liquidity (deployer is limit-exempt, so pre-launch add works)
 *   3. Exempt the LP pair, then open trading (one-way)
 *   4. Buy from a second wallet
 *   5. Sell back — the honeypot check; this MUST succeed
 *   6. Burn reduces supply
 *   7. Warp past controlDeadline and prove: transfers stay free forever and
 *      every owner power is dead (ControlWindowClosed)
 */
const { ethers, network } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

const PANCAKE_V2_ROUTER = "0x10ED43C718714eb63d5aA57B78B54704E256024E";
const ROUTER_ABI = [
  "function WETH() view returns (address)",
  "function factory() view returns (address)",
  "function addLiquidityETH(address token,uint amountTokenDesired,uint amountTokenMin,uint amountETHMin,address to,uint deadline) payable returns (uint amountToken,uint amountETH,uint liquidity)",
  "function swapExactETHForTokensSupportingFeeOnTransferTokens(uint amountOutMin,address[] path,address to,uint deadline) payable",
  "function swapExactTokensForETHSupportingFeeOnTransferTokens(uint amountIn,uint amountOutMin,address[] path,address to,uint deadline)",
];
const FACTORY_ABI = ["function getPair(address,address) view returns (address)"];

function assert(cond, msg) {
  if (!cond) throw new Error(`REHEARSAL FAILED: ${msg}`);
}

async function main() {
  if (process.env.FORK !== "true") {
    throw new Error('Run with FORK=true so the hardhat network forks BSC mainnet.');
  }

  const [deployer, buyer, carol] = await ethers.getSigners();
  console.log(`Forked BSC at block ${await ethers.provider.getBlockNumber()}`);

  // 1. Deploy with a 1-hour control window.
  const CONTROL_WINDOW = 60 * 60;
  const Knife = await ethers.getContractFactory("MacTheKnife");
  const knife = await Knife.deploy(deployer.address, CONTROL_WINDOW);
  await knife.waitForDeployment();
  const tokenAddr = await knife.getAddress();
  console.log(`1) MacTheKnife deployed: ${tokenAddr}`);

  const router = new ethers.Contract(PANCAKE_V2_ROUTER, ROUTER_ABI, deployer);
  const wbnb = await router.WETH();
  const deadline = async () => (await time.latest()) + 1200;

  // 2. Add liquidity while trading is still closed (deployer is exempt).
  const lpTokens = ethers.parseUnits("100000000", 18); // 100M KNIFE
  const lpBnb = ethers.parseEther("100");
  await (await knife.approve(PANCAKE_V2_ROUTER, lpTokens)).wait();
  await (
    await router.addLiquidityETH(tokenAddr, lpTokens, lpTokens, lpBnb, deployer.address, await deadline(), {
      value: lpBnb,
    })
  ).wait();
  const factory = new ethers.Contract(await router.factory(), FACTORY_ABI, deployer);
  const pair = await factory.getPair(tokenAddr, wbnb);
  console.log(`2) Liquidity added while trading closed. Pair: ${pair}`);

  // 3. Exempt the pair from limits, then open trading (one-way).
  await (await knife.setLimitExempt(pair, true)).wait();
  await (await knife.enableTrading()).wait();
  assert(await knife.tradingEnabled(), "trading did not enable");
  console.log(`3) Pair exempted, trading opened (one-way).`);

  // 4. Buy from a second wallet.
  const buyBnb = ethers.parseEther("1");
  await (
    await router
      .connect(buyer)
      .swapExactETHForTokensSupportingFeeOnTransferTokens(0, [wbnb, tokenAddr], buyer.address, await deadline(), {
        value: buyBnb,
      })
  ).wait();
  const bought = await knife.balanceOf(buyer.address);
  assert(bought > 0n, "buy returned 0 tokens");
  console.log(`4) Buy OK: 1 BNB -> ${ethers.formatUnits(bought, 18)} KNIFE`);

  // 5. Sell back — honeypot check.
  const bnbBefore = await ethers.provider.getBalance(buyer.address);
  await (await knife.connect(buyer).approve(PANCAKE_V2_ROUTER, bought)).wait();
  await (
    await router
      .connect(buyer)
      .swapExactTokensForETHSupportingFeeOnTransferTokens(bought, 0, [tokenAddr, wbnb], buyer.address, await deadline())
  ).wait();
  const bnbAfter = await ethers.provider.getBalance(buyer.address);
  assert(bnbAfter > bnbBefore, "sell returned no BNB — honeypot behaviour");
  console.log(`5) Sell OK: received ~${ethers.formatEther(bnbAfter - bnbBefore)} BNB back — NOT a honeypot`);

  // 6. Burn.
  const burnAmount = ethers.parseUnits("1000000", 18);
  const supplyBefore = await knife.totalSupply();
  await (await knife.burn(burnAmount)).wait();
  assert((await knife.totalSupply()) === supplyBefore - burnAmount, "burn did not reduce supply");
  console.log(`6) Burn OK: supply now ${ethers.formatUnits(await knife.totalSupply(), 18)} KNIFE`);

  // 7. The Deadhand Cut: warp past the deadline, prove freedom + dead powers.
  await time.increaseTo((await knife.controlDeadline()) + 1n);
  // Seed a fresh holder from the deployer, then move between two non-exempt
  // wallets (carol -> buyer) to prove the gate is gone, not just deployer-bypassed.
  await (await knife.transfer(carol.address, 1000n)).wait();
  await (await knife.connect(carol).transfer(buyer.address, 500n)).wait();
  assert((await knife.balanceOf(buyer.address)) === 500n, "post-deadline transfer did not land");
  console.log(`7a) Post-deadline transfers between non-exempt wallets: FREE.`);
  let powersDead = false;
  try {
    await knife.enableTrading();
  } catch (e) {
    powersDead = /ControlWindowClosed/.test(e.message);
  }
  assert(powersDead, "owner powers still callable after deadline");
  assert((await knife.status())[3] === false, "status() still reports control window open");
  console.log(`7b) Owner powers dead after deadline (ControlWindowClosed). The token is ownerless-by-clock.`);

  console.log(`\nREHEARSAL PASSED — deploy, LP add, buy, sell, burn, and the Deadhand Cut all verified against the real PancakeSwap router.`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
