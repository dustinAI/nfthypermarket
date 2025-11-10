import {Protocol} from "trac-peer";
import fs from 'fs/promises'; 
import path from 'path';
import crypto from 'crypto';
import mime from 'mime-types';

class NFTMarketplaceProtocol extends Protocol {
    constructor(peer, base, options = {}) {
        super(peer, base, options);
        this.automationWorkerRunning = false;
        
        this.receipts_path = options.receipts_path; 
        this.withdrawals_path = options.withdrawals_path; 
        
        if (this.withdrawals_path) {
            fs.mkdir(this.withdrawals_path, { recursive: true });
        }
        if (this.receipts_path) {
            fs.mkdir(this.receipts_path, { recursive: true });
        }
    }

    safeBigInt(value) {
    try {
        if (value === null || value === undefined) {
            return 0n;
        }
        
        if (typeof value === 'bigint') {
            return value;
        }
        
        if (typeof value === 'string') {
            // Verificar que sea una cadena numérica válida
            if (!/^\d+$/.test(value)) {
                console.error(`[safeBigInt] Invalid string format: ${value}`);
                return null;
            }
            return BigInt(value);
        }
        
        if (typeof value === 'number') {
            if (!Number.isInteger(value)) {
                console.error(`[safeBigInt] Cannot convert decimal to BigInt: ${value}`);
                return null;
            }
            return BigInt(value);
        }
        
        console.error(`[safeBigInt] Unsupported type: ${typeof value}, value: ${value}`);
        return null;
    } catch (error) {
        console.error(`[safeBigInt] Conversion error: ${error.message}, value: ${value}`);
        return null;
    }
}

    // --- FUNCIONES DE AYUDA ---
    toBigIntString(value, decimals) {
        if (!value) return "0";
        const [integer, fraction = ""] = value.split(".");
        const paddedFraction = fraction.padEnd(decimals, "0");
        return (integer + paddedFraction).replace(/^0+/, "") || "0";
    }

    fromBigIntString(value, decimals) {
        if (!value) return "0.0";
        const paddedValue = value.padStart(decimals + 1, "0");
        const integer = paddedValue.slice(0, -decimals);
        let fraction = paddedValue.slice(-decimals).replace(/0+$/, "");
        if (fraction === "") fraction = "0";
        return `${integer}.${fraction}`;
    }

    parseArgs(input) {
        const args = {};
        const parts = input.match(/"[^"]+"|\S+/g) || [];
        for (let i = 1; i < parts.length; i += 2) {
            const key = parts[i].replace(/^--/, '');
            let value = parts[i + 1];
            if (value && value.startsWith('"') && value.endsWith('"')) {
                value = value.substring(1, value.length - 1);
            }
            args[key] = value;
        }
        return args;
    }

    mapTxCommand(command){
        let obj = { type : '', value : null };
        const json = command;
        if(json.op !== undefined){
            const knownOps = [
                'init_file_upload', 'upload_file_chunk', 'transfer_file', 'listForSale', 
                'delist', 'buy', 'setCommission', 'requestDepositCredit', 'requestWithdrawal',
                '_admin_processCredit', '_admin_completeWithdrawal', 'addOperator', 'removeOperator',
                '_admin_setAdmin', 'operatorMint', 'set_min_collection_size',
                'set_mint_fee', 'create_collection'  
            ];
            if(knownOps.includes(json.op)){
                obj.type = json.op;
                obj.value = json;
                return obj;
            }
        }
        return null;
    }

    async _transact(command, args = {}){
        console.log(`[PROTOCOL] Processing transaction: ${JSON.stringify(command, null, 2)}`);
        let res = false;
        res = await this.peer.protocol_instance.tx({command:command}, {});
        if(res !== false){
            const err = this.peer.protocol_instance.getError(res);
            if(null !== err) throw new Error(err.message);
        }
    }

    async printOptions(){
        console.log(`
==================================================================
        WELCOME TO THE UNIFIED NFT MARKETPLACE
==================================================================

INSTRUCTIONS:

To participate in the market, you first need to deposit TAP tokens
into your internal marketplace balance.

------------------------------------------------------------------
STEP 1: DEPOSIT TAP
------------------------------------------------------------------

1.  Send the desired amount of TAP from your Hypertokens wallet to
    the official Marketplace Treasury Address:

    ${this.peer.wallet.publicKey}

2.  After the transaction is confirmed, make a note of the amount.

3.  Inform the marketplace of your deposit by running the following
    command, replacing the values with your own:

    /request_deposit --amount <amount_you_sent> --tx_hash <your_tx_hash_for_reference>

    Example: /request_deposit --amount 150.5 --tx_hash 0x123abc...

    An admin will review and approve your deposit. You can check your 
    balance with /my_balance.

------------------------------------------------------------------
AVAILABLE COMMANDS
------------------------------------------------------------------

--- NFT Management ---
/mint --path <absolute_filepath>
/my_nfts
/download_nft --file_id <id> --destination <absolute_dir_path>
/transfer_nft --file_id <id> --to <address>

--- Marketplace ---
/list_nft --file_id <id> --price <price_in_tap>
/delist_nft --file_id <id>
/buy_nft --file_id <id>

--- Balance & Funds ---
/my_balance
/request_deposit --amount <amount> --tx_hash <hash>
/request_withdrawal --amount <amount_in_tap>

--- DApp & Operator Permissions ---
/add_operator --address <operator_address>
/remove_operator

--- Admin Commands (For the Market Operator) ---
/initialize_marketplace
    - IMPORTANT: Run this command ONLY ONCE on the main peer to claim admin role.
/start_bot
    - Starts the automation worker to notify about deposits and log withdrawals.
/admin_approve_deposit --request_id <id>
    - Manually approves a pending deposit after verification.
/set_commission --rate <percentage> --beneficiary <address>

==================================================================
`);
    }

    // --- BOT DE AUTOMATIZACIÓN ---
    async startAutomationWorker() {
        if (this.automationWorkerRunning) { console.log("🤖 Automation Bot is already running."); return; }
        this.automationWorkerRunning = true;
        console.log("🤖 Automation Bot Started. Will scan for tasks every 30 seconds.");
        const run = async () => {
            while(this.automationWorkerRunning) {
                try {
                    console.log("🤖 Bot: Scanning for tasks...");
                    await this.peer.base.update();
                    await this._scanAndNotifyDeposits();
                    await this._scanAndProcessWithdrawals();
                } catch (e) { console.error("🤖 Bot Error:", e.message); }
                await this.peer.sleep(30000);
            }
        };
        run();
    }

    async _scanAndNotifyDeposits() {
        const stream = this.peer.base.view.createReadStream({ gte: 'pending_deposits/', lt: 'pending_deposits/z' });
        for await (const { key, value } of stream) {
            if (value && value.status === 'pending') {
                const requestId = key.split('/')[1];
                console.log(`
                -------------------------------------------------
                ACTION REQUIRED: Manual Deposit Approval
                - Request ID: ${requestId}
                - User: ${value.user_address}
                - Amount: ${this.fromBigIntString(value.amount, 18)} TAP
                - User Provided Hash: ${value.tx_hash}
    
                Please verify this deposit in your Treasury Wallet.
                If correct, run: /admin_approve_deposit --request_id ${requestId}
                -------------------------------------------------
                `);
            }
        }
    }

    async _scanAndProcessWithdrawals() {
        if (!this.withdrawals_path) {
            console.log("🤖 Bot: Withdrawals path not configured. Skipping withdrawal processing.");
            return;
        }
        const stream = this.peer.base.view.createReadStream({ gte: 'pending_withdrawals/', lt: 'pending_withdrawals/z' });
        for await (const { key, value } of stream) {
            if (value && value.status === 'approved') {
                const requestId = key.split('/')[1];
                console.log(`🤖 Bot: Found approved withdrawal request ${requestId} for ${value.user_address}.`);
                try {
                    const requestedAmountBigInt = BigInt(value.amount);
                    const transactionFeeBigInt = 10000000000000000n; // 0.01 TAP
                    const finalAmountBigInt = requestedAmountBigInt - transactionFeeBigInt;

                    if (finalAmountBigInt < 0n) {
                        console.error(`🤖 Bot: Withdrawal ${requestId} amount is less than the transaction fee. Aborting.`);
                        continue; 
                    }
                    const withdrawalData = {
                        withdrawal_id: requestId,
                        destination_address: value.user_address,
                        final_amount_tap: this.fromBigIntString(finalAmountBigInt.toString(), 18),
                        requested_at: value.requested_at
                    };
                    const withdrawalFilePath = path.join(this.withdrawals_path, `${requestId}.json`);
                    await fs.writeFile(withdrawalFilePath, JSON.stringify(withdrawalData, null, 2));
                    console.log(`✅ SUCCESS: Withdrawal log created at: ${withdrawalFilePath}`);
                    
                    const command = { op: '_admin_completeWithdrawal', request_id: requestId };
                    await this._transact(command);
                    console.log(`🤖 Bot: Withdrawal request ${requestId} marked as logged and completed in the contract.`);
                } catch (e) {
                    console.error(`🤖 Bot: Failed to process and log withdrawal ${requestId}. Error:`, e.message);
                }
            }
        }
    }

    // --- FUNCIONES CORE DE NFT ---
    async mintNFT(filePath) {
        console.log(`\n--- Starting mint for: ${path.basename(filePath)} ---`);
        const fileBuffer = await fs.readFile(filePath);
        const filename = path.basename(filePath);
        const file_id = await this.peer.createHash('sha256', fileBuffer);

        const existing_meta = await this.get('file_meta/' + file_id);
    
        if (existing_meta) {
            const errorMessage = `NFT with ID ${file_id} already exists on the network.`;
            console.error(`\n!!! MINT FAILED: ${errorMessage} !!!`);
            throw new Error(errorMessage);
        }

        const CHUNK_SIZE_BYTES = 2048; // Tamaño del chunk: 2 KB
        const PAUSE_BETWEEN_CHUNKS_MS = 14000; 

        const totalChunks = Math.ceil(fileBuffer.length / CHUNK_SIZE_BYTES);
        const initCommand = { op: 'init_file_upload', file_id, filename, mime_type: 'image/png', total_chunks: totalChunks, file_hash: file_id };
        await this._transact(initCommand, {});
        console.log(`--- Initialized mint. Total chunks to send: ${totalChunks} ---`);

   
        for (let i = 0; i < totalChunks; i++) {
        console.log(`[+] Uploading chunk ${i + 1} of ${totalChunks}...`);
        const chunkData = fileBuffer.toString('base64', i * CHUNK_SIZE_BYTES, (i + 1) * CHUNK_SIZE_BYTES);
        const chunkCommand = { op: 'upload_file_chunk', file_id, chunk_index: i, chunk_data: chunkData };
        await this._transact(chunkCommand, {});

        if (i < totalChunks - 1) {
            await new Promise(resolve => setTimeout(resolve, PAUSE_BETWEEN_CHUNKS_MS));
        }
    }
    console.log('--- Chunk upload complete. ---');
        console.log(`\n=== SUCCESS! NFT ${filename} (ID: ${file_id}) has been minted. ===`);
    }

    async mintNFTAsOperator(filePath, owner_address, originalFilename = null) {
    const filenameToStore = originalFilename || path.basename(filePath);
    console.log(`--- Starting OPERATOR mint for: ${filenameToStore} on behalf of ${owner_address} ---`);

    await this.peer.base.update(); 
    const operator = await this.get(`operators/${owner_address}`);
    if (!operator || operator.toLowerCase() !== this.peer.wallet.publicKey.toLowerCase()) {
        throw new Error(`Server-side check failed: This peer is not an authorized operator for ${owner_address.slice(0, 10)}.`);
    }
    const mintFee = this.safeBigInt(await this.get('mint_fee', '0'));
    if (mintFee > 0n) {
        const minterBalance = this.safeBigInt(await this.get(`internal_balances/${owner_address}`, '0'));
        if (minterBalance < mintFee) {
            throw new Error(`Insufficient funds. Required: ${this.fromBigIntString(mintFee.toString(), 18)} TAP`);
        }
    }

    const fileBuffer = await fs.readFile(filePath);
    const file_id = await this.peer.createHash('sha256', fileBuffer);

    const CHUNK_SIZE_BYTES = 2048;
    const PAUSE_BETWEEN_CHUNKS_MS = 14000; 

    const totalChunks = Math.ceil(fileBuffer.length / CHUNK_SIZE_BYTES);
    const existingNft = await this.get('nft_owner/' + file_id);

    let startChunk = 0;
    if (existingNft) {
        console.log(`--- Existing NFT found. Checking for missing chunks... ---`);
        for (let i = 0; i < totalChunks; i++) {
            if (!(await this.get(`file_chunk/${file_id}/${i}`))) {
                startChunk = i;
                break;
            }
            startChunk = i + 1;
        }
        if (startChunk >= totalChunks) {
            console.log(`--- All chunks already uploaded. Minting process already complete. ---`);
            return { file_id, filename: filenameToStore };
        }
        console.log(`--- Resuming upload from chunk ${startChunk}. ---`);
    } else {
        console.log(`--- New mint process. Initializing... ---`);
        await this._transact({ 
            op: 'operatorMint', file_id, filename: filenameToStore,
            mime_type: mime.lookup(filePath) || 'application/octet-stream',
            total_chunks: totalChunks, file_hash: file_id, owner_address
        });
    }

    for (let i = startChunk; i < totalChunks; i++) {
        console.log(`[+] Uploading chunk ${i + 1} of ${totalChunks}...`);
        const chunkData = fileBuffer.toString('base64', i * CHUNK_SIZE_BYTES, (i + 1) * CHUNK_SIZE_BYTES);
        await this._transact({ op: 'upload_file_chunk', file_id, chunk_index: i, chunk_data: chunkData });
        
        if (i < totalChunks - 1) {
            await this.peer.sleep(PAUSE_BETWEEN_CHUNKS_MS);
        }
    }
    console.log(`\n=== SUCCESS! NFT ${filenameToStore} (ID: ${file_id}) minted for ${owner_address}. ===`);
    return { file_id, filename: filenameToStore };
}

    async createCollection(name, description, bannerPath, manifestPath, owner_address) {
        console.log(`--- Starting collection creation: "${name}" ---`);

        await this.mintNFTAsOperator(bannerPath, owner_address, path.basename(bannerPath));
        const banner_file_id = await this.peer.createHash('sha256', await fs.readFile(bannerPath));
        console.log(`--- Banner minted. File ID: ${banner_file_id} ---`);

        const manifestContent = await fs.readFile(manifestPath, 'utf-8');
        const manifest = JSON.parse(manifestContent);
        if (!manifest.items || !Array.isArray(manifest.items)) {
            throw new Error('Invalid manifest file: Missing "items" array.');
        }
        await this.mintNFTAsOperator(manifestPath, owner_address, path.basename(manifestPath));
        const manifest_file_id = await this.peer.createHash('sha256', Buffer.from(manifestContent));
        console.log(`--- Manifest file minted. File ID: ${manifest_file_id} ---`);
        
        this.peer.contract_instance.address = owner_address;
        await this._transact({
            op: 'create_collection', collection_name: name, collection_description: description,
            banner_file_id, manifest_file_id, collection_size: manifest.items.length
        });
        this.peer.contract_instance.address = null;

        console.log(`\n=== SUCCESS! Collection "${name}" registered on the network. ===`);
    }

    async downloadNFT(file_id, destination_path) {
        console.log(`\n--- Starting download for file ID: ${file_id} ---`);
        await this.peer.base.update();
        const metadata = await this.get('file_meta/' + file_id);
        if (!metadata) throw new Error(`[PROTOCOL] File with ID ${file_id} not found.`);

        const { filename, total_chunks } = metadata;
        console.log(`--- File found: ${filename}. Total chunks to download: ${total_chunks} ---`);

        const chunks = [];
        for (let i = 0; i < total_chunks; i++) {
            console.log(`[+] Downloading chunk ${i + 1} of ${total_chunks}...`);
            const chunkDataB64 = await this.get(`file_chunk/${file_id}/${i}`);
            if (!chunkDataB64) throw new Error(`[PROTOCOL] Critical error: Chunk ${i} is missing.`);
            chunks.push(Buffer.from(chunkDataB64, 'base64'));
        }
        
        console.log('--- Chunk download complete. Reassembling file... ---');
        const fileBuffer = Buffer.concat(chunks);
        await fs.mkdir(destination_path, { recursive: true });
        const finalFilePath = path.join(destination_path, filename);
        await fs.writeFile(finalFilePath, fileBuffer);
        console.log(`\n=== SUCCESS! File ${filename} has been downloaded to: ${finalFilePath} ===`);
        return finalFilePath;
    }

    // --- MANEJADOR PRINCIPAL DE COMANDOS ---
    async customCommand(input) {
        try {
            const args = this.parseArgs(input);
            const commandName = input.split(' ')[0];

            switch(commandName) {
                case '/commands': await this.printOptions(); break;
                case '/mint':
                    if (!args.path) throw new Error('Please specify a file path using --path');
                    await this.mintNFT(args.path);
                    break;
                case '/set_mint_fee':
                    if (!args.amount || !args.beneficiary) throw new Error("--amount and --beneficiary are required");
                    await this._transact({ op: 'set_mint_fee', amount: args.amount, beneficiary_address: args.beneficiary });
                    break;
                case '/my_nfts':
                    console.log("Searching for NFTs owned by you...");
                    await this.peer.base.update();
                    const myPublicKey = this.peer.wallet.publicKey;
                    
                    const myFileIds = await this.get('user_nfts/' + myPublicKey) || [];

                    if (myFileIds.length === 0) {
                        console.log("You do not own any NFTs.");
                    } else {
                        console.log(`You own ${myFileIds.length} NFT(s):`);
                        for (const file_id of myFileIds) {
                            const metadata = await this.get('file_meta/' + file_id);
                            console.log(`  - ${metadata ? metadata.filename : 'Unknown Filename'} (ID: ${file_id})`);
                        }
                    }
                    break;
                case '/download_nft':
                    if (!args.file_id || !args.destination) throw new Error("Please specify --file_id and --destination");
                    await this.downloadNFT(args.file_id, args.destination);
                    break;
                case '/list_nft':
                    if (!args.file_id || !args.price) throw new Error("Please specify --file_id and --price");
                    this.peer.contract_instance.address = this.peer.wallet.publicKey;
                    await this._transact({ op: 'listForSale', file_id: args.file_id, price: this.toBigIntString(args.price, 18), owner_address: this.peer.wallet.publicKey });
                    this.peer.contract_instance.address = null;
                    break;
                case '/delist_nft':
                    if (!args.file_id) throw new Error("Please specify --file_id");
                    this.peer.contract_instance.address = this.peer.wallet.publicKey;
                    await this._transact({ op: 'delist', file_id: args.file_id, owner_address: this.peer.wallet.publicKey });
                    this.peer.contract_instance.address = null;
                    break;
                case '/buy_nft':
                    if (!args.file_id) throw new Error("Please specify --file_id");
                    this.peer.contract_instance.address = this.peer.wallet.publicKey;
                    await this._transact({ op: 'buy', file_id: args.file_id });
                    this.peer.contract_instance.address = null;
                    break;
                case '/transfer_nft':
                    if (!args.file_id || !args.to) throw new Error("Please specify --file_id and --to");
                    this.peer.contract_instance.address = this.peer.wallet.publicKey;
                    await this._transact({ op: 'transfer_file', file_id: args.file_id, to_address: args.to, owner_address: this.peer.wallet.publicKey });
                    this.peer.contract_instance.address = null;
                    break;
                case '/add_operator':
                    if (!args.address) throw new Error("Please specify the operator's address using --address");
                    this.peer.contract_instance.address = this.peer.wallet.publicKey;
                    await this._transact({ op: 'addOperator', operator_address: args.address });
                    this.peer.contract_instance.address = null;
                    break;
                case '/remove_operator':
                    this.peer.contract_instance.address = this.peer.wallet.publicKey;
                    await this._transact({ op: 'removeOperator' });
                    this.peer.contract_instance.address = null;
                    break;
                case '/create_collection':
                    if (!args.name || !args.description || !args.banner || !args.manifest || !args.owner_address) {
                        throw new Error("--name, --description, --banner, --manifest, and --owner_address are required.");
                    }
                    await this.createCollection(args.name, args.description, args.banner, args.manifest, args.owner_address);
                    break;
                case '/my_balance':
                    await this.peer.base.update();
                    const balance = await this.get('internal_balances/' + this.peer.wallet.publicKey);
                    console.log(`Your internal marketplace balance is: ${this.fromBigIntString(balance || '0', 18)} TAP`);
                    break;
                case '/request_deposit':
                     if (!args.tx_hash || !args.amount) throw new Error("Both --tx_hash and --amount are required.");
                     this.peer.contract_instance.address = this.peer.wallet.publicKey;
                     await this._transact({op: 'requestDepositCredit', tx_hash: args.tx_hash, amount: this.toBigIntString(args.amount, 18)});
                     this.peer.contract_instance.address = null;
                     break;
                case '/set_min_collection_size': // <-- Nombre corregido
                    if (!args.size) throw new Error("--size is required.");
                    // Añadir validación para asegurarse de que es un número
                    const size = parseInt(args.size, 10);
                    if (isNaN(size) || size < 1) throw new Error("--size must be a positive number.");

                    // El admin debe ser el que envía esta transacción
                    this.peer.contract_instance.address = this.peer.wallet.publicKey;
                    await this._transact({ op: 'set_min_collection_size', min_size: size });
                    this.peer.contract_instance.address = null;

                    console.log(`SUCCESS! Transaction to set minimum collection size to ${size} has been submitted.`);
                    break;
                case '/request_withdrawal':
                    if (!args.amount) throw new Error("--amount is required.");
                    this.peer.contract_instance.address = this.peer.wallet.publicKey;
                    await this._transact({op: 'requestWithdrawal', amount: this.toBigIntString(args.amount, 18)});
                    this.peer.contract_instance.address = null;
                    break;
                case '/start_bot':
                    this.startAutomationWorker();
                    break;
                case '/initialize_marketplace':
                    await this.peer.base.update();
                    const currentAdmin = await this.get('admin');
                    if (currentAdmin !== null) {
                        console.log(`!!! ERROR: The marketplace has already been initialized. The admin is: ${currentAdmin}`);
                        return;
                    }
                    console.log("Initializing the marketplace and claiming the admin role...");
                    this.peer.contract_instance.address = this.peer.wallet.publicKey;
                    await this._transact({ op: '_admin_setAdmin', admin_address: this.peer.wallet.publicKey });
                    this.peer.contract_instance.address = null;
                    console.log("SUCCESS! You have been set as the marketplace admin.");
                    break;
                case '/admin_approve_deposit':
                    if (!args.request_id) throw new Error("--request_id is required.");
                    const request = await this.get('pending_deposits/' + args.request_id);
                    if (!request) throw new Error(`Deposit request ${args.request_id} not found.`);
                    if (request.status !== 'pending') throw new Error(`Deposit request ${args.request_id} is not pending.`);
                    console.log(`Approving deposit for ${request.user_address}...`);
                    this.peer.contract_instance.address = this.peer.wallet.publicKey; // El admin actúa
                    await this._transact({ op: '_admin_processCredit', user_address: request.user_address, request_id: args.request_id, amount: request.amount });
                    this.peer.contract_instance.address = null;
                    console.log("Deposit approved successfully.");
                    break;
                case '/set_commission':
                    if (!args.rate || !args.beneficiary) throw new Error("--rate and --beneficiary are required.");
                    this.peer.contract_instance.address = this.peer.wallet.publicKey;
                    await this._transact({ op: 'setCommission', rate: args.rate, beneficiary_address: args.beneficiary });
                    this.peer.contract_instance.address = null;
                    break;
                default:
                    console.log("Unknown command. Type /commands to see the list of available commands.");
            }
        } catch (e) {
            console.error(`\n!!! COMMAND FAILED: ${e.message} !!!`);
        } finally {
            this.peer.contract_instance.address = null;
        }
    }
}
export default NFTMarketplaceProtocol;
