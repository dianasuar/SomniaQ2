const { ethers } = require("ethers");

// 1️⃣ Make sure “https://” is present:
const RPC_URL =
  "https://rpc.ankr.com/somnia_testnet/6e3fd81558cf77b928b06b38e9409b4677b637118114e83364486294d5ff4811";
const provider = new ethers.JsonRpcProvider(RPC_URL);

// 2️⃣ Contract addresses
const contractMap = {
  hole:      "0x69e35A5d84710374a33899692EF581CeD2EEa9C4",
  slapScr:   "0x55c3852cACf7F5FeE29c1f7566953B8fF3b6bAd6",
};

// 3️⃣ Completion thresholds (in human‐units)
const completionThresholds = {
  hole:   50000,
  slapScr: 1000,
};

// 4️⃣ ABIs: balanceOf and decimals
const BALANCE_ABI  = ["function balanceOf(address) view returns (uint256)"];
const DECIMALS_ABI = ["function decimals() view returns (uint8)"];

module.exports = async (req, res) => {
  const { address } = req.query;

  // 1. Validate input
  if (!address || !ethers.isAddress(address)) {
    return res.status(400).json({ error: "Invalid wallet address" });
  }

  // 2. Quick “smoke test” to confirm RPC is reachable
  try {
    const blockNumber = await provider.getBlockNumber();
    console.log("📡 Somnia Testnet block number:", blockNumber);
  } catch (err) {
    console.error("❌ RPC connection failed:", err.message);
    return res
      .status(503)
      .json({ error: "Cannot connect to Somnia RPC node", details: err.message });
  }

  // 3. Pre‐fetch decimals for each token
  const decimalsMap = {};
  for (const [key, tokenAddr] of Object.entries(contractMap)) {
    try {
      const tokenContract = new ethers.Contract(tokenAddr, DECIMALS_ABI, provider);
      const d = await tokenContract.decimals();
      decimalsMap[key] = d;
      console.log(`ℹ️  ${key}.decimals() = ${d}`);
    } catch (err) {
      console.warn(`⚠️  Failed to fetch decimals() for ${key}:`, err.message);
      // Fallback to 18 if decimals() call fails
      decimalsMap[key] = 18;
    }
  }

  // 4. Loop through each contract and call balanceOf()
  const data = {};
  for (const [key, tokenAddr] of Object.entries(contractMap)) {
    try {
      const contract = new ethers.Contract(tokenAddr, BALANCE_ABI, provider);
      const balanceBN = await contract.balanceOf(address);
      const decimals = decimalsMap[key] ?? 18;
      const humanBalance = parseFloat(ethers.formatUnits(balanceBN, decimals));

      const threshold = completionThresholds[key];
      const completed = typeof threshold === "number"
        ? humanBalance > threshold
        : null;

      data[key] = {
        balance: humanBalance,
        completed,
      };
    } catch (error) {
      console.error(`⚠️  Error fetching ${key} for ${address}:`, error.message);
      data[key] = {
        balance: null,
        completed: false,
        error: error.message,
      };
    }
  }

  // 5. Return the result
  return res.status(200).json({
    wallet: address,
    data,
  });
};
