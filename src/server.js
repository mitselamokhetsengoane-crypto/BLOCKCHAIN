require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");
const crypto = require("crypto");

const app = express();
app.use(cors());
app.use(express.json());

// Supabase Setup
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Security
const authenticate = (req, res, next) => {
    const token = req.headers.authorization?.split(" ")[1];
    if (token !== process.env.BLOCKCHAIN_SERVICE_TOKEN) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    next();
};

// --- HASHING LOGIC ---
const canonicalStringify = (obj) => {
    return JSON.stringify(obj, Object.keys(obj).sort());
};

const calculateHash = (blockData) => {
    return crypto.createHash("sha256").update(canonicalStringify(blockData)).digest("hex");
};

const generateTxHash = (txData) => {
    return crypto.createHash("sha256").update(canonicalStringify(txData)).digest("hex");
};

// --- CORE ENGINE ---
const getLatestBlock = async () => {
    const { data, error } = await supabase
        .from("chain_blocks")
        .select("*")
        .order("block_number", { ascending: false })
        .limit(1)
        .single();
    
    if (error && error.code !== "PGRST116") throw error;
    return data;
};

const addBlock = async (transactions) => {
    const latestBlock = await getLatestBlock();
    
    const blockNumber = latestBlock ? latestBlock.block_number + 1 : 0;
    const previousHash = latestBlock ? latestBlock.current_hash : "0".repeat(64);
    const timestamp = new Date().toISOString();

    const blockData = { blockNumber, timestamp, transactions, previousHash };
    const currentHash = calculateHash(blockData);

    const { data, error } = await supabase
        .from("chain_blocks")
        .insert({
            block_number: blockNumber,
            timestamp,
            previous_hash: previousHash,
            current_hash: currentHash,
            transactions
        })
        .select()
        .single();

    if (error) throw error;
    return data;
};

// --- ROUTES ---
app.get("/health", (req, res) => {
    res.json({ status: "ok", service: "AgriHerd Custom Chain" });
});

app.post("/transactions", authenticate, async (req, res) => {
    try {
        const { recordType, recordRef, data } = req.body;
        if (!recordType || !recordRef || !data) {
            return res.status(400).json({ error: "Missing required fields" });
        }

        const txData = { recordType, recordRef, data, timestamp: new Date().toISOString() };
        const txHash = generateTxHash(txData);

        const { data: existing } = await supabase
            .from("chain_transactions")
            .select("id")
            .eq("tx_hash", txHash)
            .single();
        
        if (existing) {
            return res.status(409).json({ error: "Transaction already exists" });
        }

        const block = await addBlock([txData]);

        const { error } = await supabase
            .from("chain_transactions")
            .insert({
                block_number: block.block_number,
                record_type: recordType,
                record_ref: recordRef,
                record_hash: block.current_hash,
                tx_hash: txHash,
                timestamp: txData.timestamp,
                data: txData
            })
            .select()
            .single();

        if (error) throw error;

        res.json({
            status: "success",
            transactionHash: txHash,
            blockNumber: block.block_number,
            blockHash: block.current_hash
        });
    } catch (err) {
        console.error("Transaction failed:", err.message);
        res.status(500).json({ error: err.message });
    }
});

app.get("/blocks", authenticate, async (req, res) => {
    const { data, error } = await supabase
        .from("chain_blocks")
        .select("*")
        .order("block_number", { ascending: true });
    
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

app.get("/verify-chain", authenticate, async (req, res) => {
    try {
        const { data: blocks, error } = await supabase
            .from("chain_blocks")
            .select("*")
            .order("block_number", { ascending: true });

        if (error) throw error;
        if (!blocks || blocks.length === 0) {
            return res.json({ status: "EMPTY", verified: true, message: "No blocks yet" });
        }

        let isValid = true;
        let brokenAt = null;

        for (let i = 0; i < blocks.length; i++) {
            const block = blocks[i];

            const blockData = {
                blockNumber: block.block_number,
                timestamp: block.timestamp,
                transactions: block.transactions,
                previousHash: block.previous_hash
            };
            const expectedHash = calculateHash(blockData);

            if (expectedHash !== block.current_hash) {
                isValid = false;
                brokenAt = block.block_number;
                break;
            }

            if (i > 0) {
                const prevBlock = blocks[i - 1];
                if (block.previous_hash !== prevBlock.current_hash) {
                    isValid = false;
                    brokenAt = block.block_number;
                    break;
                }
            }
        }

        res.json({
            status: isValid ? "VERIFIED" : "TAMPERED",
            verified: isValid,
            totalBlocks: blocks.length,
            brokenAt,
            message: isValid ? "Chain integrity confirmed" : `Chain broken at block ${brokenAt}`
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, "0.0.0.0", () => {
    console.log(`Custom Blockchain Engine running on port ${PORT}`);
});