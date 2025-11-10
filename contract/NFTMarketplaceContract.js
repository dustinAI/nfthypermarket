import {Contract} from 'trac-peer';
import crypto from 'crypto';

class NFTMarketplaceContract extends Contract {
    constructor(protocol, options = {}) {
        super(protocol, options);

        // --- SCHEMAS ---
        const signatureSchema = { $$strict: false, type: "object", props: {
            signature: { type: "string" },
            nonce: { type: "string" },
            from_address: { type: "is_hex" }
        }};
        
        this.addSchema('operatorMint', { value: { $$strict: true, $$type: "object", op: { type: "string" }, file_id: { type: "string" }, filename: { type: "string" }, mime_type: { type: "string" }, total_chunks: { type: "number", integer: true, min: 1 }, file_hash: { type: "string" }, owner_address: { type: "is_hex" } } });
        this.addSchema('set_min_collection_size', { value: { $$strict: true, $$type: "object", op: { type: "string" }, min_size: { type: "number", integer: true, min: 1 } } });
        this.addSchema('upload_file_chunk', { value: { $$strict: true, $$type: "object", op: { type: "string" }, file_id: { type: "string" }, chunk_index: { type: "number", integer: true, min: 0 }, chunk_data: { type: "string" }} });
        this.addSchema('create_collection', { value: { $$strict: true, $$type: "object", op: { type: "string" }, collection_name: { type: "string", min: 3 }, collection_description: { type: "string" }, banner_file_id: { type: "string" }, manifest_file_id: { type: "string" }, collection_size: { type: "number", integer: true } } });
        this.addSchema('transfer_file', { value: { $$strict: true, $$type: "object", op: { type: "string" }, file_id: { type: "string" }, to_address: { type: "is_hex" }, owner_address: {type: "is_hex"} } });
        this.addSchema('listForSale', { value: { $$strict: true, $$type: "object", op: { type: "string" }, file_id: { type: "string" }, price: { type: "string", numeric: true, min: 1 }, owner_address: {type: "is_hex"} } });
        this.addSchema('delist', { value: { $$strict: true, $$type: "object", op: { type: "string" }, file_id: { type: "string" }, owner_address: {type: "is_hex"} } });
        this.addSchema('buy', { value: { $$strict: true, $$type: "object", op: { type: "string" }, file_id: { type: "string" }, signature_data: signatureSchema } });
        this.addSchema('addOperator', { value: { $$strict: true, $$type: "object", op: { type: "string" }, operator_address: { type: "is_hex" }, signature_data: signatureSchema } });
        this.addSchema('removeOperator', { value: { $$strict: true, $$type: "object", op: { type: "string" }, signature_data: signatureSchema } });
        this.addSchema('set_mint_fee', { value: { $$strict: true, $$type: "object", op: { type: "string" }, amount: { type: "string" }, beneficiary_address: { type: "is_hex" } } });
        this.addSchema('requestDepositCredit', { value: { $$strict: true, $$type: "object", op: {type: "string"}, tx_hash: {type: "string"}, amount: {type: "string", numeric: true}, signature_data: signatureSchema} });
        this.addSchema('requestWithdrawal', { 
    value: { 
        $$strict: true, 
        $$type: "object", 
        op: { type: "string" }, 
        amount: { type: "string", numeric: true }, 
        signature_data: signatureSchema 
    } 
});
        this.addSchema('_admin_setAdmin', { value: { $$strict: true, $$type: "object", op: { type: "string" }, admin_address: { type: "is_hex" } } });
        this.addSchema('setCommission', { value: { $$strict: true, $$type: "object", op: { type: "string" }, rate: { type: "string", numeric: true }, beneficiary_address: { type: "is_hex" } } });
        this.addSchema('_admin_processCredit', { value: { $$strict: true, $$type: "object", op: {type: "string"}, user_address: {type: "is_hex"}, request_id: {type: "string"}, amount: {type: "string", numeric: true}} });
        this.addSchema('_admin_completeWithdrawal', { value: { $$strict: true, $$type: "object", op: {type: "string"}, request_id: {type: "string"}} });
        
        // Registra la nueva "feature" para depósitos automáticos
        this.addFeature('notify_deposit_tap', this.notify_deposit_tap.bind(this));
        
        this.messageHandler(async function() {});
    }

    async _get(key, defaultValue = null) {
        const result = await this.get(key);
        return result !== null ? result : defaultValue;
    }
    
    async notify_deposit_tap() {
        console.log("[CONTRACT_DEBUG] === INICIO notify_deposit_tap ===");
        console.log("[CONTRACT_DEBUG] this.value:", JSON.stringify(this.value, null, 2));
        console.log("[CONTRATO] notify_deposit_tap llamada. this.value:", JSON.stringify(this.value, null, 2));
        
        

        const { from_address: user_address, amount: depositAmountStr } = this.value;
        console.log(`[CONTRACT_DEBUG] User Address: ${user_address}, Amount: ${depositAmountStr}`);
        console.log("[CONTRATO] Extraído: user_address =", user_address, ", depositAmountStr =", depositAmountStr);
        // Verificar si user_address es nulo o indefinido después de la desestructuración
        if (!user_address) {
            console.error("[CONTRACT_DEBUG] ERROR: user_address es inválido o nulo. Payload:", JSON.stringify(payload));
            console.error("[CONTRATO] Error: user_address es nulo o indefinido. Payload recibido:", JSON.stringify(payload));
            return; // Detener la ejecución si no hay dirección de usuario válida.
        }

        console.log(`[CONTRATO] Procesando orden de depósito para ${user_address} por ${depositAmountStr}`);

        const currentBalanceStr = await this._get(`internal_balances/${user_address}`, '0');
        const currentBalance = this.protocol.safeBigInt(currentBalanceStr);
        const depositAmount = this.protocol.safeBigInt(depositAmountStr);

        if (depositAmount === null) {
            console.error("[CONTRATO] Error: El monto del depósito es inválido.");
            return;
        }

    const newBalance = currentBalance + depositAmount;
    await this.put(`internal_balances/${user_address}`, newBalance.toString());
    console.log(`[CONTRATO] Balance de ${user_address} actualizado a: ${newBalance.toString()}`);
}

    // --- El resto de las funciones del contrato no cambian ---
    async _verifySignature() { const { signature_data } = this.value; if (!signature_data) throw new Error("Permission Denied: This action requires a signature."); const { signature, nonce, from_address } = signature_data; if (!signature || !nonce || !from_address) throw new Error("Invalid signature data provided."); const originalCommand = { ...this.value }; delete originalCommand.signature_data; delete originalCommand.op; const messageToVerify = JSON.stringify(originalCommand) + nonce; const isVerified = this.protocol.peer.wallet.verify(signature, messageToVerify, from_address); if (!isVerified) throw new Error("Invalid signature. Verification failed."); return from_address; }
    async _isAuthorized(required_owner_address) { if (typeof required_owner_address !== 'string' || required_owner_address.length < 64) { throw new Error(`Authorization check failed: An invalid owner_address was provided. Value: ${required_owner_address}`); } const sender = this.address; if (typeof sender !== 'string') { throw new Error(`Authorization check failed: An invalid sender (this.address) was detected. Value: ${sender}`); } const ownerAddressLower = required_owner_address.toLowerCase(); const senderLower = sender.toLowerCase(); if (senderLower === ownerAddressLower) { return true; } const operator = await this._get(`operators/${required_owner_address}`); if (operator && typeof operator === 'string' && senderLower === operator.toLowerCase()) { return true; } throw new Error(`Permission Denied: Sender (${sender.slice(0,10)}) is not the owner (${required_owner_address.slice(0,10)}) or an authorized operator.`); }
    async _isAdmin() { const admin = await this._get('admin'); if (!admin || this.address.toLowerCase() !== admin.toLowerCase()) { throw new Error("Permission Denied: This action can only be performed by the admin peer."); } }
    async addOperator() { const owner_address = await this._verifySignature(); const { operator_address } = this.value; await this.put(`operators/${owner_address}`, operator_address); }
    async removeOperator() { const owner_address = await this._verifySignature(); await this.del(`operators/${owner_address}`); }
    async operatorMint() {
        const { file_id, filename, mime_type, total_chunks, file_hash, owner_address } = this.value;
        await this._isAuthorized(owner_address);

        // --- INICIO DE LÓGICA DE TARIFA DE MINTEO ---
        const adminAddress = await this._get('admin', null);
        const mintFee = this.protocol.safeBigInt(await this._get('mint_fee', '0'));
    
        // Se cobra la tarifa solo si es mayor que cero y si el que mintea NO es el admin
        if (mintFee > 0n && owner_address.toLowerCase() !== adminAddress.toLowerCase()) {
            console.log(`[CONTRATO] Aplicando tarifa de minteo de ${this.protocol.fromBigIntString(mintFee.toString(), 18)} TAP`);
            const beneficiaryAddress = await this._get('mint_fee_beneficiary');
            if (!beneficiaryAddress) throw new Error("Mint fee is set, but no beneficiary address is configured.");

            let minterBalance = this.protocol.safeBigInt(await this._get(`internal_balances/${owner_address}`, '0'));

            if (minterBalance < mintFee) {
                throw new Error(`Insufficient funds to pay the minting fee. Required: ${this.protocol.fromBigIntString(mintFee.toString(), 18)} TAP`);
            }

            // Deducir tarifa del usuario y acreditarla al beneficiario
            minterBalance -= mintFee;
            await this.put(`internal_balances/${owner_address}`, minterBalance.toString());

            let beneficiaryBalance = this.protocol.safeBigInt(await this._get(`internal_balances/${beneficiaryAddress}`, '0'));
            beneficiaryBalance += mintFee;
            await this.put(`internal_balances/${beneficiaryAddress}`, beneficiaryBalance.toString());
        
            console.log(`[CONTRATO] Tarifa de minteo cobrada exitosamente.`);
        }
        // --- FIN DE LÓGICA DE TARIFA ---

        const existing_meta = await this._get(`file_meta/${file_id}`);
        if (existing_meta) throw new Error(`File ID ${file_id} already exists.`);
    
        const metadata_object = { filename, mime_type, total_chunks, file_hash, creator: owner_address };
        await this.put(`file_meta/${file_id}`, metadata_object);
        await this.put(`nft_owner/${file_id}`, owner_address);
        await this.put(`is_in_escrow/${file_id}`, false);

        let ownerNfts = await this._get(`user_nfts/${owner_address}`, []);
        if (!Array.isArray(ownerNfts)) ownerNfts = [];
        ownerNfts.push(file_id);
        await this.put(`user_nfts/${owner_address}`, ownerNfts);
    }
    async upload_file_chunk() { const { file_id, chunk_index, chunk_data } = this.value; await this.put(`file_chunk/${file_id}/${chunk_index}`, chunk_data); }
    async set_min_collection_size() { await this._isAdmin(); await this.put('config/min_collection_size', this.value.min_size); }
    async transfer_file() { const { file_id, to_address, owner_address } = this.value; const current_owner = await this._get(`nft_owner/${file_id}`); if (!current_owner) throw new Error(`File ID ${file_id} not found.`); if (current_owner.toLowerCase() !== owner_address.toLowerCase()) throw new Error('Ownership mismatch.'); await this._isAuthorized(owner_address); const in_escrow = await this._get(`is_in_escrow/${file_id}`); if (in_escrow) throw new Error(`Cannot transfer a file that is listed for sale. Delist it first.`); if (owner_address.toLowerCase() === to_address.toLowerCase()) throw new Error("Cannot transfer file to yourself."); await this.put(`nft_owner/${file_id}`, to_address); let sellerNfts = await this._get(`user_nfts/${owner_address}`, []); const fileIndex = sellerNfts.indexOf(file_id); if (fileIndex > -1) sellerNfts.splice(fileIndex, 1); await this.put(`user_nfts/${owner_address}`, sellerNfts); let buyerNfts = await this._get(`user_nfts/${to_address}`, []); if (!Array.isArray(buyerNfts)) buyerNfts = []; buyerNfts.push(file_id); await this.put(`user_nfts/${to_address}`, buyerNfts); }
    async listForSale() { const { file_id, price, owner_address } = this.value; const current_owner = await this._get(`nft_owner/${file_id}`); if (!current_owner) throw new Error(`File ID ${file_id} not found.`); if (current_owner.toLowerCase() !== owner_address.toLowerCase()) throw new Error('Ownership mismatch.'); await this._isAuthorized(owner_address); const in_escrow = await this._get(`is_in_escrow/${file_id}`); if (in_escrow) throw new Error(`File ${file_id} is already listed for sale.`); await this.put(`is_in_escrow/${file_id}`, true); const listing = { seller_address: owner_address, price, listed_at: new Date().toISOString() }; await this.put(`listings/${file_id}`, listing); }
    async delist() { const { file_id, owner_address } = this.value; const current_owner = await this._get(`nft_owner/${file_id}`); if (!current_owner) throw new Error(`File ID ${file_id} not found.`); if (current_owner.toLowerCase() !== owner_address.toLowerCase()) throw new Error('Ownership mismatch.'); await this._isAuthorized(owner_address); const in_escrow = await this._get(`is_in_escrow/${file_id}`); if (!in_escrow) throw new Error(`File ${file_id} is not listed for sale.`); await this.put(`is_in_escrow/${file_id}`, false); await this.del(`listings/${file_id}`); }
    async buy() {
    const buyer_address = await this._verifySignature();
    const { file_id } = this.value;

    const listing = await this._get(`listings/${file_id}`);
    if (!listing) throw new Error(`Listing for file ${file_id} not found.`);

    const price = this.protocol.safeBigInt(listing.price);
    const seller_address = listing.seller_address;
    if (buyer_address.toLowerCase() === seller_address.toLowerCase()) throw new Error("Cannot buy your own listing.");

    let buyer_balance = this.protocol.safeBigInt(await this._get(`internal_balances/${buyer_address}`, '0'));
    if (buyer_balance < price) throw new Error(`Insufficient funds.`);

    const commission_rate_str = await this._get('commission_rate', '0');
    const beneficiary_address = await this._get('commission_beneficiary');
    const commission_rate_scaled = BigInt(Math.floor(parseFloat(commission_rate_str) * 100));
    const commission_amount = (price * commission_rate_scaled) / 10000n;
    const seller_proceeds = price - commission_amount;

    buyer_balance -= price;
    await this.put(`internal_balances/${buyer_address}`, buyer_balance.toString());
    let seller_balance = this.protocol.safeBigInt(await this._get(`internal_balances/${seller_address}`, '0'));
    seller_balance += seller_proceeds;
    await this.put(`internal_balances/${seller_address}`, seller_balance.toString());

    if (beneficiary_address && commission_amount > 0n) {
        let beneficiary_balance = this.protocol.safeBigInt(await this._get(`internal_balances/${beneficiary_address}`, '0'));
        beneficiary_balance += commission_amount;
        await this.put(`internal_balances/${beneficiary_address}`, beneficiary_balance.toString());
    }

    await this.put(`nft_owner/${file_id}`, buyer_address);
    
    let sellerNfts = await this._get(`user_nfts/${seller_address}`, []);
    const fileIndex = sellerNfts.indexOf(file_id);
    if (fileIndex > -1) sellerNfts.splice(fileIndex, 1);
    await this.put(`user_nfts/${seller_address}`, sellerNfts);

    // --- LÍNEAS CORREGIDAS ---
    // Se usa 'buyer_address' en lugar de la variable inexistente 'to_address'
    let buyerNfts = await this._get(`user_nfts/${buyer_address}`, []);
    if (!Array.isArray(buyerNfts)) buyerNfts = [];
    buyerNfts.push(file_id);
    await this.put(`user_nfts/${buyer_address}`, buyerNfts);
    // --- FIN DE LA CORRECCIÓN ---

    await this.put(`is_in_escrow/${file_id}`, false);
    await this.del(`listings/${file_id}`);
}
    async requestDepositCredit() { const user_address = await this._verifySignature(); const { tx_hash, amount } = this.value; const request_id = crypto.randomBytes(16).toString('hex'); const depositRequest = { user_address, tx_hash, amount, status: 'pending', requested_at: new Date().toISOString() }; await this.put(`pending_deposits/${request_id}`, depositRequest); }
    async create_collection() {
        const { collection_name, collection_description, banner_file_id, manifest_file_id, collection_size } = this.value;
        const creator_address = this.address;
        const min_size = await this._get('config/min_collection_size', 1);
        if (collection_size < min_size) {
            throw new Error(`Collection size (${collection_size}) is smaller than the required minimum (${min_size}).`);
        }

        const collectionsString = await this._get('market_collections', '[]');
        const collections = JSON.parse(collectionsString);
        if (collections.some(c => c.name === collection_name)) {
            throw new Error(`A collection with the name "${collection_name}" already exists.`);
        }

        collections.push({ id: this.tx, name: collection_name, description: collection_description, banner: banner_file_id, manifest: manifest_file_id, size: collection_size, creator: creator_address });
        await this.put('market_collections', JSON.stringify(collections));
    }
    async set_mint_fee() { await this._isAdmin(); const { amount, beneficiary_address } = this.value; const scaledAmount = this.protocol.toBigIntString(amount, 18); await this.put('mint_fee', scaledAmount); await this.put('mint_fee_beneficiary', beneficiary_address); }

    async requestWithdrawal() {
    // Para depuración, vamos a ver si la función se ejecuta
    console.log(`[CONTRACT] Ejecutando requestWithdrawal... El hash de la TX (this.tx) es:`, this.tx);

    const user_address = await this._verifySignature();
    const { amount } = this.value;

    const withdrawalAmount = this.protocol.safeBigInt(amount);
    const userBalance = this.protocol.safeBigInt(await this._get(`internal_balances/${user_address}`, '0'));

    if (userBalance < withdrawalAmount) {
        throw new Error("Withdrawal amount exceeds your internal balance.");
    }

    // Debitar del saldo (esto debe funcionar si la función se ejecuta)
    const newBalance = userBalance - withdrawalAmount;
    await this.put(`internal_balances/${user_address}`, newBalance.toString());

    // ==========================================================
    // === ESTA ES LA ÚNICA LÍNEA QUE NECESITAMOS ARREGLAR ===
    // En lugar de un ID aleatorio o 'this.hash', usamos 'this.tx'
    const request_id = this.tx;
    // ==========================================================

    // Verificación de seguridad
    if (!request_id) {
        throw new Error("[CONTRACT CRITICAL] No se pudo obtener el hash de la transacción (this.tx) para usarlo como ID.");
    }

    const withdrawalRequest = {
        user_address: user_address,
        amount: withdrawalAmount.toString(),
        status: 'approved',
        requested_at: new Date().toISOString()
    };

    // Guardar el registro usando el hash de la transacción como clave
    await this.put(`pending_withdrawals/${request_id}`, withdrawalRequest);
    console.log(`[CONTRACT] Retiro para ${user_address} registrado con ID: ${request_id}. El saldo ha sido debitado.`);
}
    async _admin_setAdmin() { await this._isAdmin(); const { admin_address } = this.value; const currentAdmin = await this._get('admin'); if (currentAdmin !== null) throw new Error("Admin role has already been set."); await this.put('admin', admin_address); }
    async _admin_processCredit() { await this._isAdmin(); const { user_address, request_id, amount } = this.value; let userBalance = this.protocol.safeBigInt(await this._get(`internal_balances/${user_address}`, '0')); userBalance += this.protocol.safeBigInt(amount); await this.put(`internal_balances/${user_address}`, userBalance.toString()); const request = await this._get(`pending_deposits/${request_id}`); if(request) { request.status = 'completed'; await this.put(`pending_deposits/${request_id}`, request); } }
    async _admin_completeWithdrawal() { await this._isAdmin(); const { request_id } = this.value; const request = await this._get(`pending_withdrawals/${request_id}`); if (!request || request.status !== 'approved') return; request.status = 'completed'; request.processed_at = new Date().toISOString(); await this.put(`pending_withdrawals/${request_id}`, request); }
    async setCommission() { await this._isAdmin(); const { rate, beneficiary_address } = this.value; if (parseFloat(rate) < 0 || parseFloat(rate) > 100) throw new Error("Commission rate must be between 0 and 100."); await this.put('commission_rate', rate); await this.put('commission_beneficiary', beneficiary_address); }
}

export default NFTMarketplaceContract;