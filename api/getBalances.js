const { ethers } = require("ethers");

// 1️⃣ Make sure “https://” is present:
const RPC_URL =
  "https://rpc.ankr.com/somnia_testnet/6e3fd81558cf77b928b06b38e9409b4677b637118114e83364486294d5ff4811";
const provider = new ethers.JsonRpcProvider(RPC_URL);

// 2️⃣ Contract addresses
const contractMap = {
  snkA:      "0x696ee979e8CC1D5a2CA7778606a3269C00978346",
  snkScore:  "0x5Cb442D8A3D7A7153BE93202e232919bE3C84C5A",
  dashScore: "0x754F014dFC79eE5b3bd4335637622Ce03f26bBd9",
};

// 3️⃣ Completion thresholds (in human‐units)
const completionThresholds = {
  snkA:      10,    // “10 tokens”
  snkScore: 3500,   // “3,500 tokens”
  dashScore: 3000,  // “3,000 tokens”
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
