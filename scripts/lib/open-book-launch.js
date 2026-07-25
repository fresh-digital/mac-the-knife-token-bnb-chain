const {
  DEAD_ADDRESS,
  MAINNET_CHAIN_ID,
  MAINNET_CONFIRMATION,
  OPEN_BOOK_PROFILE,
  ZERO_ADDRESS,
  amountFromBps,
  isMainnetFork,
} = require("./open-book-profile");

const ROUTER_ABI = [
  "function WETH() view returns (address)",
  "function factory() view returns (address)",
  "function addLiquidityETH(address token,uint amountTokenDesired,uint amountTokenMin,uint amountETHMin,address to,uint deadline) payable returns (uint amountToken,uint amountETH,uint liquidity)",
];

const FACTORY_ABI = ["function getPair(address,address) view returns (address)"];

const PAIR_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function getReserves() view returns (uint112 reserve0,uint112 reserve1,uint32 blockTimestampLast)",
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function transfer(address,uint256) returns (bool)",
];

function assert(condition, message) {
  if (!condition) throw new Error(`OPEN BOOK LAUNCH ABORTED: ${message}`);
}

async function sendAndWait(
  label,
  transactionName,
  transactionPromise,
  confirmations = 1,
  checkpoint = async () => {}
) {
  const transaction = await transactionPromise;
  console.log(`${label}: ${transaction.hash}`);
  await checkpoint("transaction-broadcast", {
    transaction: transactionName,
    hash: transaction.hash,
  });
  const receipt = await transaction.wait(confirmations);
  assert(receipt?.status === 1, `${label} transaction failed`);
  await checkpoint("transaction-confirmed", {
    transaction: transactionName,
    hash: receipt.hash,
    blockNumber: receipt.blockNumber,
  });
  return receipt;
}

async function verifyWithSourcify(hre, address) {
  const attempts = 3;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await hre.run("verify:sourcify", {
        address,
        contract: "contracts/MacTheKnife.sol:MacTheKnife",
      });
      return;
    } catch (error) {
      if (attempt === attempts) throw error;
      console.log(`Sourcify attempt ${attempt} failed; retrying in 5s: ${error.message}`);
      await new Promise((resolve) => setTimeout(resolve, 5_000));
    }
  }
}

async function readPoolReserves(pair, tokenAddress, wbnbAddress) {
  const [token0, token1, reserves] = await Promise.all([
    pair.token0(),
    pair.token1(),
    pair.getReserves(),
  ]);

  const token = tokenAddress.toLowerCase();
  const wbnb = wbnbAddress.toLowerCase();
  assert(
    [token0.toLowerCase(), token1.toLowerCase()].includes(token),
    "pair does not contain KNIFE"
  );
  assert(
    [token0.toLowerCase(), token1.toLowerCase()].includes(wbnb),
    "pair does not contain WBNB"
  );

  return token0.toLowerCase() === token
    ? { knife: reserves.reserve0, wbnb: reserves.reserve1 }
    : { knife: reserves.reserve1, wbnb: reserves.reserve0 };
}

async function executeOpenBookLaunch(hre, options = {}) {
  const { ethers, network } = hre;
  const actualChainId = Number((await ethers.provider.getNetwork()).chainId);
  const fork = process.env.FORK === "true";
  const mainnetFork = isMainnetFork(actualChainId, fork);
  const realMainnet = actualChainId === MAINNET_CHAIN_ID;

  assert(
    realMainnet || mainnetFork,
    `expected BSC mainnet (56) or a declared Hardhat mainnet fork; got ${actualChainId}`
  );
  if (realMainnet) {
    assert(
      process.env.CONFIRM_OPEN_BOOK_LAUNCH === MAINNET_CONFIRMATION,
      `set CONFIRM_OPEN_BOOK_LAUNCH=${MAINNET_CONFIRMATION} after reviewing DEPLOYMENT.md`
    );
  }

  const profile = options.profile || OPEN_BOOK_PROFILE;
  const controlWindowSeconds =
    options.controlWindowSeconds ?? profile.controlWindowSeconds;
  const liquidityBnb = options.liquidityBnb || profile.liquidityBnb;
  const verifySource = options.verifySource ?? realMainnet;
  const confirmations = realMainnet ? 3 : 1;
  const checkpoint = async (event, details = {}) => {
    if (options.onCheckpoint) {
      await options.onCheckpoint({
        event,
        recordedAt: new Date().toISOString(),
        ...details,
      });
    }
  };

  const [deployer] = await ethers.getSigners();
  assert(deployer, "no signer is configured");

  const routerCode = await ethers.provider.getCode(profile.router);
  assert(routerCode !== "0x", `no contract exists at router ${profile.router}`);

  const liquidityWei = ethers.parseEther(liquidityBnb);
  const gasBufferWei = ethers.parseEther(profile.gasBufferBnb);
  const balanceBefore = await ethers.provider.getBalance(deployer.address);
  assert(
    balanceBefore >= liquidityWei + gasBufferWei,
    `deployer needs at least ${ethers.formatEther(
      liquidityWei + gasBufferWei
    )} BNB; balance is ${ethers.formatEther(balanceBefore)} BNB`
  );

  console.log("\nOPEN BOOK COMMUNITY LAUNCH");
  console.log(`Network:          ${network.name} (RPC chain ${actualChainId})`);
  console.log(`Deployer:         ${deployer.address}`);
  console.log(`Liquidity:        ${liquidityBnb} BNB + 100% of KNIFE`);
  console.log(`Max wallet:       1% until the 72h control deadline`);
  console.log(`LP disposition:   burn to ${DEAD_ADDRESS}`);
  console.log("Ownership:        renounce after launch configuration\n");
  await checkpoint("launch-started", {
    rpcChainId: actualChainId,
    simulatedMainnetFork: mainnetFork,
    deployer: deployer.address,
    profile: profile.name,
  });

  const Knife = await ethers.getContractFactory("MacTheKnife");
  const knife = await Knife.deploy(deployer.address, controlWindowSeconds);
  const deploymentTransaction = knife.deploymentTransaction();
  const tokenAddress = await knife.getAddress();
  console.log(`Contract deployment broadcast: ${deploymentTransaction.hash}`);
  await checkpoint("transaction-broadcast", {
    transaction: "deployment",
    hash: deploymentTransaction.hash,
    token: tokenAddress,
  });
  const deploymentReceipt = await deploymentTransaction.wait(confirmations);
  assert(deploymentReceipt?.status === 1, "contract deployment transaction failed");
  const deploymentBlock = await ethers.provider.getBlock(
    deploymentReceipt.blockNumber
  );
  const controlDeadline = await knife.controlDeadline();
  await checkpoint("transaction-confirmed", {
    transaction: "deployment",
    hash: deploymentReceipt.hash,
    blockNumber: deploymentReceipt.blockNumber,
    token: tokenAddress,
    controlDeadlineUnix: Number(controlDeadline),
  });
  console.log(`Contract deployed: ${tokenAddress}`);
  console.log(`Deployment tx:     ${deploymentReceipt.hash}`);

  if (verifySource) {
    console.log("\nVerifying source on Sourcify before liquidity and trading...");
    await verifyWithSourcify(hre, tokenAddress);
    await checkpoint("source-verified", {
      service: "sourcify",
      token: tokenAddress,
    });
  }

  const supply = await knife.totalSupply();
  const liquidityTokens = amountFromBps(supply, profile.tokenLiquidityBps);
  assert(liquidityTokens === supply, "the frozen profile must place 100% of supply in LP");

  const router = new ethers.Contract(profile.router, ROUTER_ABI, deployer);
  const [factoryAddress, wbnbAddress] = await Promise.all([
    router.factory(),
    router.WETH(),
  ]);
  assert(factoryAddress !== ZERO_ADDRESS, "router returned a zero factory");
  assert(wbnbAddress !== ZERO_ADDRESS, "router returned a zero WBNB address");

  const approvalReceipt = await sendAndWait(
    "Approve PancakeSwap Router V2",
    "approval",
    knife.approve(profile.router, liquidityTokens),
    confirmations,
    checkpoint
  );

  const latestBlock = await ethers.provider.getBlock("latest");
  const deadline = latestBlock.timestamp + 20 * 60;
  const addLiquidityReceipt = await sendAndWait(
    "Add KNIFE/BNB liquidity",
    "addLiquidity",
    router.addLiquidityETH(
      tokenAddress,
      liquidityTokens,
      liquidityTokens,
      liquidityWei,
      deployer.address,
      deadline,
      { value: liquidityWei }
    ),
    confirmations,
    checkpoint
  );

  const factory = new ethers.Contract(factoryAddress, FACTORY_ABI, deployer);
  const pairAddress = await factory.getPair(tokenAddress, wbnbAddress);
  assert(pairAddress !== ZERO_ADDRESS, "PancakeSwap factory returned no pair");
  const pair = new ethers.Contract(pairAddress, PAIR_ABI, deployer);
  await checkpoint("pair-discovered", {
    token: tokenAddress,
    pair: pairAddress,
    factory: factoryAddress,
    wbnb: wbnbAddress,
  });

  const pool = await readPoolReserves(pair, tokenAddress, wbnbAddress);
  assert(pool.knife === liquidityTokens, "pool KNIFE reserve differs from launch profile");
  assert(pool.wbnb === liquidityWei, "pool WBNB reserve differs from launch profile");

  const pairExemptReceipt = await sendAndWait(
    "Exempt LP pair",
    "pairExemption",
    knife.setLimitExempt(pairAddress, true),
    confirmations,
    checkpoint
  );
  const routerExemptReceipt = await sendAndWait(
    "Exempt PancakeSwap router",
    "routerExemption",
    knife.setLimitExempt(profile.router, true),
    confirmations,
    checkpoint
  );

  const maxWallet = amountFromBps(supply, profile.maxWalletBps);
  const capReceipt = await sendAndWait(
    "Set 1% max wallet",
    "maxWallet",
    knife.setMaxWalletBeforeLaunch(maxWallet),
    confirmations,
    checkpoint
  );
  const tradingReceipt = await sendAndWait(
    "Enable trading",
    "enableTrading",
    knife.enableTrading(),
    confirmations,
    checkpoint
  );

  const lpBalance = await pair.balanceOf(deployer.address);
  assert(lpBalance > 0n, "deployer received no LP tokens");
  const lpBurnReceipt = await sendAndWait(
    "Burn all deployer LP tokens",
    "burnLp",
    pair.transfer(profile.lpRecipient, lpBalance),
    confirmations,
    checkpoint
  );
  assert(
    (await pair.balanceOf(deployer.address)) === 0n,
    "deployer still controls LP tokens"
  );
  assert(
    (await pair.balanceOf(profile.lpRecipient)) >= lpBalance,
    "LP burn address did not receive the LP tokens"
  );

  const renounceReceipt = await sendAndWait(
    "Renounce ownership",
    "renounceOwnership",
    knife.renounceOwnership(),
    confirmations,
    checkpoint
  );

  const status = await knife.status();
  assert(status.trading === true, "trading is not enabled");
  assert(status.maxWallet_ === maxWallet, "max wallet differs from the frozen profile");
  assert(status.ownershipRenounced === true, "ownership was not renounced");
  assert((await knife.owner()) === ZERO_ADDRESS, "owner slot is not zero");
  await checkpoint("final-state-verified", {
    token: tokenAddress,
    pair: pairAddress,
    trading: true,
    maxWallet: maxWallet.toString(),
    lpTokensBurned: lpBalance.toString(),
    ownershipRenounced: true,
  });

  return {
    schemaVersion: 1,
    profile: profile.name,
    network: network.name,
    rpcChainId: actualChainId,
    simulatedMainnetFork: mainnetFork,
    deployer: deployer.address,
    token: tokenAddress,
    pair: pairAddress,
    router: profile.router,
    factory: factoryAddress,
    wbnb: wbnbAddress,
    liquidityBnb,
    liquidityKnife: liquidityTokens.toString(),
    maxWallet: maxWallet.toString(),
    maxWalletPercent: "1",
    controlWindowSeconds,
    deployedAtUnix: deploymentBlock.timestamp,
    controlDeadlineUnix: Number(controlDeadline),
    lpBurnAddress: profile.lpRecipient,
    lpTokensBurned: lpBalance.toString(),
    ownershipRenounced: true,
    sourceVerification: verifySource ? "sourcify" : "skipped-on-local-fork",
    publicLinks: {
      source: `https://repo.sourcify.dev/56/${tokenAddress}`,
      explorer: `https://bscscan.com/address/${tokenAddress}`,
      swap: `https://pancakeswap.finance/swap?outputCurrency=${tokenAddress}`,
    },
    transactions: {
      deployment: deploymentReceipt.hash,
      approval: approvalReceipt.hash,
      addLiquidity: addLiquidityReceipt.hash,
      pairExemption: pairExemptReceipt.hash,
      routerExemption: routerExemptReceipt.hash,
      maxWallet: capReceipt.hash,
      enableTrading: tradingReceipt.hash,
      burnLp: lpBurnReceipt.hash,
      renounceOwnership: renounceReceipt.hash,
    },
  };
}

module.exports = {
  FACTORY_ABI,
  PAIR_ABI,
  ROUTER_ABI,
  executeOpenBookLaunch,
  readPoolReserves,
};
