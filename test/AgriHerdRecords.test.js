const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("AgriHerdRecords", function () {
  let contract;
  let owner;
  let authorizedUser;
  let unauthorizedUser;

  // Sample hashes
  const HASH_1 = ethers.keccak256(ethers.toUtf8Bytes("RECORD_001"));
  const HASH_2 = ethers.keccak256(ethers.toUtf8Bytes("RECORD_002"));

  beforeEach(async function () {
    [owner, authorizedUser, unauthorizedUser] = await ethers.getSigners();

    const AgriHerdRecords = await ethers.getContractFactory("AgriHerdRecords");
    contract = await AgriHerdRecords.deploy();
    await contract.waitForDeployment();
  });

  describe("Deployment", function () {
    it("Should set the deployer as the owner", async function () {
      expect(await contract.owner()).to.equal(owner.address);
    });

    it("Should start with zero records", async function () {
      expect(await contract.getRecordCount()).to.equal(0);
    });
  });

  describe("Record Submission", function () {
    it("Should allow authorized user to add a record", async function () {
      await expect(
        contract.connect(owner).addRecord(HASH_1, "SALE", "SALE-001")
      ).to.emit(contract, "RecordAdded");
    });

    it("Should prevent adding duplicate hashes", async function () {
      await contract.connect(owner).addRecord(HASH_1, "SALE", "SALE-001");
      
      await expect(
        contract.connect(owner).addRecord(HASH_1, "SALE", "SALE-001")
      ).to.be.revertedWith("Record already exists");
    });

    it("Should prevent unauthorized users from adding records", async function () {
      await expect(
        contract.connect(unauthorizedUser).addRecord(HASH_2, "HARVEST", "HAR-001")
      ).to.be.revertedWith("Not authorized to submit records");
    });

    it("Should allow owner to authorize new submitters", async function () {
      await contract.connect(owner).authorizeSubmitter(authorizedUser.address);
      expect(await contract.authorizedSubmitters(authorizedUser.address)).to.equal(true);
    });

    it("Should allow newly authorized user to submit a record", async function () {
      await contract.connect(owner).authorizeSubmitter(authorizedUser.address);
      await expect(
        contract.connect(authorizedUser).addRecord(HASH_2, "SCAN", "SCAN-001")
      ).to.emit(contract, "RecordAdded");
    });
  });

  describe("Verification", function () {
    beforeEach(async function () {
      await contract.connect(owner).addRecord(HASH_1, "SALE", "SALE-001");
    });

    it("Should return true for existing records", async function () {
      expect(await contract.verifyRecord(HASH_1)).to.equal(true);
    });

    it("Should return false for non-existent records", async function () {
      expect(await contract.verifyRecord(HASH_2)).to.equal(false);
    });

    it("Should retrieve correct record metadata", async function () {
      const record = await contract.getRecord(HASH_1);
      expect(record.recordType).to.equal("SALE");
      expect(record.recordRef).to.equal("SALE-001");
      expect(record.submitter).to.equal(owner.address);
    });

    it("Should revert when retrieving a non-existent record", async function () {
      await expect(
        contract.getRecord(HASH_2)
      ).to.be.revertedWith("Record not found");
    });
  });

  describe("Access Control", function () {
    it("Should allow owner to revoke submitter access", async function () {
      await contract.connect(owner).authorizeSubmitter(authorizedUser.address);
      await contract.connect(owner).revokeSubmitter(authorizedUser.address);
      expect(await contract.authorizedSubmitters(authorizedUser.address)).to.equal(false);
    });

    it("Should prevent non-owner from authorizing submitters", async function () {
      await expect(
        contract.connect(unauthorizedUser).authorizeSubmitter(authorizedUser.address)
      ).to.be.revertedWith("Only owner can authorize");
    });
  });
});