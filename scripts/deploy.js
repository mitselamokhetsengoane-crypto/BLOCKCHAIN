const hre = require("hardhat");

async function main() {
  console.log("🚀 Starting deployment of AgriHerdRecords...");

  const AgriHerdRecords = await hre.ethers.getContractFactory("AgriHerdRecords");
  const contract = await AgriHerdRecords.deploy();
  await contract.waitForDeployment();

  const contractAddress = await contract.getAddress();
  const deployer = (await hre.ethers.getSigners())[0];
  const network = hre.network.name;
  const blockNumber = await hre.ethers.provider.getBlockNumber();

  console.log("\n✅ Deployment successful!");
  console.log("--------------------------------------------------");
  console.log(`Network:          ${network}`);
  console.log(`Contract Address: ${contractAddress}`);
  console.log(`Deployer Address: ${deployer.address}`);
  console.log(`Block Number:     ${blockNumber}`);
  console.log("--------------------------------------------------");
  
  console.log("\n📋 COPY THESE ENVIRONMENT VARIABLES TO RENDER:\n");
  console.log(`BLOCKCHAIN_RPC_URL="<YOUR_SEPOLIA_RPC_URL>"`);
  console.log(`CONTRACT_ADDRESS="${contractAddress}"`);
  console.log(`BLOCKCHAIN_PRIVATE_KEY="<YOUR_METAMASK_PRIVATE_KEY>"`);
  console.log("\n⚠️  WARNING: Never commit your private key to GitHub. Add it ONLY in the Render dashboard.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Deployment failed:");
    console.error(error);
    process.exit(1);
  });