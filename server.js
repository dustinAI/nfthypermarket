import express from 'express';
import cors from 'cors';
import path from 'path';
import multer from 'multer';
import { fileURLToPath } from 'url';
import { startApp } from './src/main.js';
import fs from 'fs/promises';
import readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Global Error Handlers ---
process.on('unhandledRejection', (reason, promise) => { console.error('FATAL Unhandled Rejection:', reason, promise); });
process.on('uncaughtException', (error) => { console.error('FATAL Uncaught Exception:', error); process.exit(1); });

async function getCuratedNftMetadataCache() {
    const metadataMap = new Map();
    const collectionsPath = path.join(__dirname, 'public', 'collections');
    try {
        const collectionFolders = await fs.readdir(collectionsPath, { withFileTypes: true });

        for (const dirent of collectionFolders) {
            if (dirent.isDirectory()) {
                const jsonPath = path.join(collectionsPath, dirent.name, 'metadata_con_rareza.json');
                try {
                    const fileContent = await fs.readFile(jsonPath, 'utf-8');
                    const metadata = JSON.parse(fileContent);
                    if (Array.isArray(metadata)) {
                        for (const nft of metadata) {
                            if (nft.file_id) {
                                metadataMap.set(nft.file_id, nft); // Guardamos el objeto completo
                            }
                        }
                    }
                } catch (e) {
                    // Ignorar carpetas sin JSON o con errores
                }
            }
        }
    } catch (e) {
        console.warn('[Cache] No se pudo leer el directorio de colecciones.');
    }
    console.log(`[Cache] Cargados los metadatos de ${metadataMap.size} NFTs curados.`);
    return metadataMap;
}

async function addToMintLog(newRecord) {
    const outputDir = path.join(__dirname, 'minted_output');
    const logFilePath = path.join(outputDir, 'mint_log.json');

    try {
        await fs.mkdir(outputDir, { recursive: true });
        let logData = [];
        try {
            const currentLog = await fs.readFile(logFilePath, 'utf-8');
            logData = JSON.parse(currentLog);
        } catch (error) {
            if (error.code !== 'ENOENT') throw error;
        }
        
        logData.push(newRecord);
        await fs.writeFile(logFilePath, JSON.stringify(logData, null, 2));
    } catch (error) {
        console.error(`[FATAL] No se pudo actualizar mint_log.json:`, error);
    }
}

async function main() {
    const storageName = process.argv[2];
    console.log(`Starting P2P node in storage: "${storageName || 'default'}"...`);

    const app = await startApp(storageName);
    const peer = app.getPeer();
    const protocol = peer.protocol_instance;
    console.log('[Cache] Inicializando cache de metadatos de NFTs curados...');
    const curatedNftMetadataCache = await getCuratedNftMetadataCache();

    // --- Create cache and collections directories if they don't exist ---
    const nftCachePath = path.join(__dirname, 'public', 'nft-cache');
    const collectionsPath = path.join(__dirname, 'public', 'collections');
    await fs.mkdir(nftCachePath, { recursive: true });
    await fs.mkdir(collectionsPath, { recursive: true });


    await app.featuresLoadedPromise;
    console.log('[Status] Peer is synchronized and ready to receive API queries.');
    const isPeerReadyForQueries = true;

    console.log('P2P node started successfully.');
    console.log(`[server.js] PROTOCOL LOADED: ${protocol.constructor.name}`);
    console.log('MARKETPLACE ADDRESS FOR DEPOSITS:', peer.wallet.publicKey);
    
    const server = express();
    const port = process.env.PORT || 3001;
    const upload = multer({ dest: 'uploads/' });

    server.use(cors());
    server.use(express.json());
    server.use(express.static(path.join(__dirname, 'public')));
    
    // --- API ROUTES ---

    server.get('/api/status', (req, res) => {
        res.json({ ready: isPeerReadyForQueries });
    });

    server.get('/api/listings', async (req, res) => {
        try {
            if (!isPeerReadyForQueries) return res.status(503).json({ error: 'P2P server is not ready yet.' });

            await peer.base.update();

            const allListings = [];
            const stream = peer.base.view.createReadStream({ gte: 'listings/', lt: 'listings/z' });

            for await (const { key, value } of stream) {
                if (value) {
                    const file_id = key.split('/')[1];

                    
                    if (!curatedNftMetadataCache.has(file_id)) {
                        const metadata = await protocol.get(`file_meta/${file_id}`);
                        allListings.push({
                            ...value,
                            file_id: file_id,
                            filename: metadata ? metadata.filename : `NFT-${file_id.substring(0,8)}...`,
                            price: protocol.fromBigIntString(value.price, 18)
                        });
                    }
                    
                }
            }
            res.json(allListings);
        } catch (e) { res.status(500).json({ error: e.message }); }
    });
    
    server.get('/api/all-listings', async (req, res) => {
        try {
            if (!isPeerReadyForQueries) return res.status(503).json({ error: 'P2P server is not ready yet.' });
            
            await peer.base.update();

            const allListings = [];
            const stream = peer.base.view.createReadStream({ gte: 'listings/', lt: 'listings/z' });
            for await (const { key, value } of stream) {
                if (value) {
                    const file_id = key.split('/')[1];
                    const metadata = await protocol.get(`file_meta/${file_id}`);
                    
                    allListings.push({ 
                        ...value,
                        file_id: file_id, 
                        filename: metadata ? metadata.filename : `NFT-${file_id.substring(0,8)}...`,
                        price: protocol.fromBigIntString(value.price, 18)
                    });
                }
            }
            res.json(allListings);
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    server.get('/api/collections', async (req, res) => {
        try {
            if (!isPeerReadyForQueries) {
                return res.status(503).json({ error: 'P2P server is not ready yet.' });
            }
        
            await peer.base.update(); // Sincronizar con el estado de la red

            const collectionsString = await protocol.get('market_collections'); // Leemos sin valor por defecto para ver si es null
            let allCollections = []; // Por defecto, creamos un array vacío

            if (collectionsString) { // Solo si la clave existe y tiene contenido...
                try {
                    allCollections = JSON.parse(collectionsString); // ... intentamos analizarla.
                    // Nos aseguramos de que el resultado sea un array
                    if (!Array.isArray(allCollections)) {
                        console.error('[API /api/collections] Data for market_collections is not an array.');
                        allCollections = [];
                    }
                } catch(e) {
                    console.error('[API /api/collections] Failed to parse market_collections JSON:', e);
                    allCollections = []; // Si falla el parseo, devolvemos un array vacío
                }
            }

            res.json(allCollections);

        } catch (e) {
            console.error('[API /api/collections] ERROR:', e);
            // Manejar el caso de que el JSON esté malformado, aunque es poco probable.
            if (e instanceof SyntaxError) {
                 return res.status(500).json({ error: 'Failed to parse collections data from the network.' });
            }
            res.status(500).json({ error: e.message });
        }
    });
    server.get('/api/collection/:collectionId', async (req, res) => {
        try {
            const { collectionId } = req.params;
            // Validamos que el ID sea un string no vacío.
            if (!collectionId || typeof collectionId !== 'string') {
                return res.status(400).json({ error: 'Invalid Collection ID.' });
            }
            // ...
            // Comparamos directamente los strings.
            const collectionsString = await protocol.get('market_collections');
            const collections = collectionsString ? JSON.parse(collectionsString) : [];
            const collectionData = collections.find(c => c.id === collectionId);

            if (!collectionData) {
                return res.status(404).json({ error: 'Collection not found.' });
            }

            // 2. Descargar y leer el manifiesto de la colección
            const manifestFileId = collectionData.manifest;
            const tempManifestPath = await protocol.downloadNFT(manifestFileId, '.'); // Descarga temporal
            const manifestContent = await fs.readFile(tempManifestPath, 'utf-8');
            await fs.unlink(tempManifestPath); // Limpiar el archivo temporal
        
            const manifest = JSON.parse(manifestContent);

            if (!manifest.items || manifest.items.length === 0) {
                return res.json({ collection: collectionData, items: [] });
            }

            // 3. Enriquecer los datos de cada item con sus metadatos
            const enrichedItems = [];
            for (const fileId of manifest.items) {
                const metadata = await protocol.get(`file_meta/${fileId}`);
                enrichedItems.push({
                    file_id: fileId,
                    filename: metadata ? metadata.filename : `NFT-${fileId.substring(0,8)}...`
                });
            }
        
            res.json({ collection: collectionData, items: enrichedItems });

        } catch (e) {
            console.error(`[API /api/collection/${req.params.collectionId}] ERROR:`, e);
            res.status(500).json({ error: 'Server error while processing collection.', details: e.message });
        }
    });
    // --- NEW: Smart NFT Image Serving Endpoint ---
    server.get('/api/nft-image/:file_id', async (req, res) => {
        const { file_id } = req.params;
        try {
            if (!file_id) return res.status(400).send('File ID is required.');
            
            const metadata = await protocol.get(`file_meta/${file_id}`);
            if (!metadata || !metadata.filename) {
                return res.status(404).send('NFT metadata not found.');
            }
            
            const originalFilename = metadata.filename;
            const fileExtension = path.extname(originalFilename);
            const canonicalCacheFilename = `${file_id}${fileExtension}`;

            // --- Hybrid Cache Logic ---
            // 1. Check artist collections folder first
            let foundPath = null;
            const collectionDirs = await fs.readdir(collectionsPath);
            for (const dir of collectionDirs) {
                const collectionItemPath = path.join(collectionsPath, dir, originalFilename);
                try {
                    await fs.access(collectionItemPath);
                    foundPath = `/collections/${dir}/${originalFilename}`;
                    break;
                } catch (e) { /* File not in this dir, continue */ }
            }

            // 2. If not in artist collections, check default cache
            if (!foundPath) {
                const defaultCachePath = path.join(nftCachePath, canonicalCacheFilename);
                 try {
                    await fs.access(defaultCachePath);
                    foundPath = `/nft-cache/${canonicalCacheFilename}`;
                } catch (e) { /* Not in default cache either */ }
            }
            
            // 3. If found anywhere, redirect to the static file
            if (foundPath) {
                return res.redirect(foundPath);
            }

            // 4. If not found (cache miss), download from P2P network
            console.log(`[Cache Miss] Downloading image for file_id: ${file_id}`);
            const tempDownloadPath = await protocol.downloadNFT(file_id, nftCachePath);
            
            // Rename the downloaded file to our canonical cache name
            const newCachePath = path.join(nftCachePath, canonicalCacheFilename);
            await fs.rename(tempDownloadPath, newCachePath);
            
            res.redirect(`/nft-cache/${canonicalCacheFilename}`);

        } catch (e) {
            console.error(`[NFT Image Server] Error serving ${file_id}:`, e);
            res.status(500).sendFile(path.join(__dirname, 'public', 'images', 'placeholder.png'));
        }
    });

    server.get('/api/my-nfts/:address', async (req, res) => {
        try {
            if (!isPeerReadyForQueries) return res.status(503).json({ error: 'P2P server is not ready yet.' });
            await peer.base.update();
            const { address } = req.params;
            const nftIds = await protocol.get(`user_nfts/${address}`) || [];

            const nfts = [];
            for (const id of nftIds) {
                const metadata = await protocol.get(`file_meta/${id}`);
                if (metadata) {
                    // Empezamos con la data básica
                    let nftData = {
                        file_id: id,
                        filename: metadata.filename,
                        seller_address: address
                    };

                    // --- INICIO DE LA LÓGICA DE ENRIQUECIMIENTO ---
                    // Si el ID está en nuestra cache de curados...
                    if (curatedNftMetadataCache.has(id)) {
                        // ...obtenemos los detalles completos y los fusionamos
                        const curatedDetails = curatedNftMetadataCache.get(id);
                        nftData = { ...nftData, ...curatedDetails };
                    }
                    

                    const listingData = await protocol.get(`listings/${id}`);
                    if (listingData) {
                        nftData.price = protocol.fromBigIntString(listingData.price, 18);
                    }

                    nfts.push(nftData);
                }
            }
            res.json(nfts);
        } catch (e) {
            console.error('[API /api/my-nfts] ERROR:', e);
            res.status(500).json({ error: e.message });
        }
    });

    server.get('/api/is-operator-authorized/:user_address', async (req, res) => {
        try {
            if (!isPeerReadyForQueries) return res.status(503).json({ error: 'P2P server is not ready yet.' });
            await peer.base.update();
            const { user_address } = req.params;
            const operator = await protocol.get(`operators/${user_address}`);
            const isAuthorized = operator && operator.toLowerCase() === peer.wallet.publicKey.toLowerCase();
            res.json({ isAuthorized });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    server.get('/api/balance/:address', async (req, res) => {
        try {
            if (!isPeerReadyForQueries) return res.status(503).json({ error: 'P2P server is not ready yet.' });
            await peer.base.update();
            const { address } = req.params;
            const balance = await protocol.get(`internal_balances/${address}`);
            res.json({ balance: protocol.fromBigIntString(balance || '0', 18) });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    server.get('/api/marketplace-address', async (req, res) => {
        try {
            await peer.base.update(); // Sincronizar para obtener el último estado

            // Usamos la función 'get' del protocolo para leer la clave 'admin'.
            const adminAddress = await protocol.get('admin');

            if (adminAddress) {
                // Si se encuentra la dirección del admin, la enviamos.
                res.json({ address: adminAddress });
            } else {
                console.error("[API /api/marketplace-address] Admin address not set in the contract.");
                res.status(404).json({ 
                    error: 'Marketplace Not Initialized', 
                    details: 'The administrator address has not been set yet. Deposits are not possible.' 
                });
            }
        } catch (e) {
            console.error("[API /api/marketplace-address] Error fetching admin address:", e);
            res.status(500).json({ error: 'Server Error', details: e.message });
        }
    });

     server.get('/api/operator-address', (req, res) => {
    try {
        // Comprobamos que el peer y su billetera existen antes de acceder a la clave.
        if (peer && peer.wallet && peer.wallet.publicKey) {
            res.json({ address: peer.wallet.publicKey });
        } else {
            // Este error nos avisará si el servidor aún no está listo.
            throw new Error('Peer or wallet not initialized.');
        }
    } catch (e) {
        console.error("[API /api/operator-address] Error:", e);
        res.status(500).json({ error: 'Could not retrieve operator address.' });
    }
});   

    server.get('/api/curated-collections', async (req, res) => {
        try {
            const collectionsPath = path.join(__dirname, 'public', 'collections');
            const collectionFolders = await fs.readdir(collectionsPath, { withFileTypes: true });

            const collectionsData = await Promise.all(
                collectionFolders
                    .filter(dirent => dirent.isDirectory())
                    .map(async (dirent) => {
                        const collectionName = dirent.name;
                        
                        const imagePath = `/collections/${collectionName}/portada.png`; 
                    

                        return {
                            id: collectionName,
                            name: collectionName.charAt(0).toUpperCase() + collectionName.slice(1), // Capitaliza el nombre
                            imageUrl: imagePath
                        };
                    })
            );

            res.json(collectionsData);
        } catch (e) {
            console.error('[API /api/curated-collections] Error:', e);
            res.status(500).json({ error: 'Could not list curated collections.' });
        }
    });


    server.get('/api/curated-collections/:collectionName', async (req, res) => {
        try {
            const { collectionName } = req.params;
            
            if (!collectionName || collectionName.includes('..')) {
                return res.status(400).json({ error: 'Invalid collection name.' });
            }

            const filePath = path.join(__dirname, 'public', 'collections', collectionName, 'metadata_con_rareza.json');

            
            const fileContent = await fs.readFile(filePath, 'utf-8');
            res.setHeader('Content-Type', 'application/json');
            res.send(fileContent);

        } catch (e) {
            if (e.code === 'ENOENT') {
                return res.status(404).json({ error: 'Collection data not found.' });
            }
            console.error(`[API /api/curated-collections/${req.params.collectionName}] Error:`, e);
            res.status(500).json({ error: 'Could not retrieve collection data.' });
        }
    });
    server.post('/api/create-collection', upload.fields([
        { name: 'bannerFile', maxCount: 1 },
        { name: 'manifestFile', maxCount: 1 }
    ]), async (req, res) => {
        try {
            const { owner_address, name, description } = req.body;

            // Validaciones básicas
            if (!owner_address || !name || !description) {
                return res.status(400).json({ error: 'owner_address, name, and description are required.' });
            }
            if (!req.files || !req.files.bannerFile || !req.files.manifestFile) {
                return res.status(400).json({ error: 'Both a banner image and a manifest file are required.' });
            }

            const bannerPath = req.files.bannerFile[0].path;
            const manifestPath = req.files.manifestFile[0].path;

            console.log(`[API /api/create-collection] Received request to create collection "${name}" for ${owner_address}`);
        
            // Llamamos a la función del protocolo que ya tienes
            await protocol.createCollection(name, description, bannerPath, manifestPath, owner_address);

            res.json({ success: true, message: 'Collection created successfully!' });

        } catch (e) {
            console.error('[API /api/create-collection] ERROR:', e);
            res.status(500).json({ error: 'Failed to create collection', details: e.message });
        }
    });    

    server.post('/api/execute-signed-tx', async (req, res) => {
    try {
        const { command, signature, nonce, from_address } = req.body;

        // 1. Verificación básica de que todos los datos necesarios llegaron.
        if (!command || !command.type || !signature || !nonce || !from_address) {
            return res.status(400).json({ error: 'Malformed request.' });
        }

        // --- INICIO DE LOS PRE-FLIGHT CHECKS ---
        
        await peer.base.update(); // Actualizamos la vista de la red una sola vez.

        // 2. CHEQUEO PARA RETIROS ('requestWithdrawal')
        if (command.type === 'requestWithdrawal') {
            console.log(`[Pre-Flight] Checking balance for withdrawal for ${from_address}`);
            const userBalance = protocol.safeBigInt(await protocol.get(`internal_balances/${from_address}`, '0'));
            const withdrawalAmount = protocol.safeBigInt(command.amount);

            if (userBalance < withdrawalAmount) {
                console.error(`[Pre-Flight Failed] Insufficient funds for withdrawal. User has ${userBalance}, needs ${withdrawalAmount}.`);
                return res.status(400).json({ 
                    error: 'Insufficient Funds', 
                    details: 'Your internal balance is not enough to cover this withdrawal.' 
                });
            }
            console.log(`[Pre-Flight OK] User has sufficient balance for withdrawal.`);
        } 
        
        // 3. CHEQUEO PARA COMPRAS ('buy')
        else if (command.type === 'buy') {
            console.log(`[Pre-Flight] Checking balance for purchase for ${from_address}`);
            
            // Obtener el saldo del comprador
            const buyerBalance = protocol.safeBigInt(await protocol.get(`internal_balances/${from_address}`, '0'));
            
            // Obtener el precio del NFT desde el listado en la red
            const listing = await protocol.get(`listings/${command.file_id}`);
            if (!listing) {
                console.error(`[Pre-Flight Failed] Listing not found for file ID: ${command.file_id}`);
                return res.status(404).json({ 
                    error: 'Listing Not Found', 
                    details: 'This NFT is no longer for sale or does not exist.' 
                });
            }
            const price = protocol.safeBigInt(listing.price);

            // Comparar saldo con precio
            if (buyerBalance < price) {
                console.error(`[Pre-Flight Failed] Insufficient funds for purchase. User has ${buyerBalance}, needs ${price}.`);
                return res.status(400).json({ 
                    error: 'Insufficient Funds', 
                    details: 'Your internal balance is not enough to purchase this NFT.' 
                });
            }
            console.log(`[Pre-Flight OK] User has sufficient balance for purchase.`);
        }
        
        // --- FIN DE LOS PRE-FLIGHT CHECKS ---

        // 4. Si todos los chequeos pasan, se procesa la transacción.
        console.log(`[Pre-Flight OK] Submitting transaction for op: ${command.type}`);
        const commandWithOp = { ...command, op: command.type };
        const fullCommand = { ...commandWithOp, signature_data: { signature, nonce, from_address } };
        
        await protocol._transact(fullCommand);
        
        res.json({ success: true, message: 'Transaction submitted successfully.' });

    } catch (e) {
        console.error('[API /api/execute-signed-tx] ERROR:', e);
        res.status(400).json({ error: 'Failed to execute transaction', details: e.message });
    }
});

    server.post('/api/list-nft', async (req, res) => {
        try {
            const { file_id, price, owner_address } = req.body;

            // Validación básica de entrada
            if (!file_id || !price || !owner_address) {
                return res.status(400).json({ error: 'Missing required fields: file_id, price, and owner_address are required.' });
            }

            // --- INICIO DEL PRE-FLIGHT CHECK para LISTING ---
        
            console.log(`[Pre-Flight] Checking if NFT ${file_id} is already listed...`);
            await peer.base.update(); // Sincronizar con el estado más reciente de la red

            // 1. Intentar obtener el listado para este file_id.
            // La clave de los listados es 'listings/<file_id>'.
            const existingListing = await protocol.get(`listings/${file_id}`);

            // 2. Si se encuentra un listado, el NFT ya está a la venta.
            if (existingListing) {
                console.error(`[Pre-Flight Failed] NFT ${file_id} is already listed for sale.`);
                return res.status(409).json({ // 409 Conflict es un buen código de estado para esto.
                    error: 'Already Listed', 
                    details: 'This NFT is already listed for sale. You must delist it first before listing it again.' 
                });
            }
        
            console.log(`[Pre-Flight OK] NFT ${file_id} is not currently listed. Proceeding.`);
            // --- FIN DEL PRE-FLIGHT CHECK ---

            // 3. Si el chequeo pasa, proceder con la transacción.
            const command = { 
                op: 'listForSale', 
                file_id: file_id, 
                price: protocol.toBigIntString(price, 18), 
                owner_address: owner_address 
            };
        
            await protocol._transact(command);
        
            res.json({ success: true, message: 'NFT listed successfully.' });

        } catch (e) {
            console.error('[API /api/list-nft] ERROR:', e);
            res.status(400).json({ error: 'Failed to list NFT', details: e.message });
        }
    });
    
    server.post('/api/delist-nft', async (req, res) => {
        try {
            const { file_id, owner_address } = req.body;
            if (!file_id || !owner_address) return res.status(400).json({ error: 'file_id and owner_address are required.' });
            const command = { op: 'delist', file_id, owner_address };
            await protocol._transact(command);
            res.json({ success: true, message: 'NFT delisted successfully.' });
        } catch (e) {
            console.error('[API /api/delist-nft] ERROR:', e);
            res.status(400).json({ error: 'Failed to delist NFT', details: e.message });
        }
    });

    server.post('/api/transfer-nft', async (req, res) => {
        try {
            const { file_id, to_address, owner_address } = req.body;
            if (!file_id || !to_address || !owner_address) return res.status(400).json({ error: 'file_id, to_address, and owner_address are required.' });
            const command = { op: 'transfer_file', file_id, to_address, owner_address };
            await protocol._transact(command);
            res.json({ success: true, message: 'NFT transferred successfully.' });
        } catch (e) {
            console.error('[API /api/transfer-nft] ERROR:', e);
            res.status(400).json({ error: 'Failed to transfer NFT', details: e.message });
        }
    });
    
    server.post('/api/mint-nft', upload.single('nftFile'), async (req, res) => {
    const tempFilePath = req.file.path;
    try {
        const { owner_address } = req.body;
        if (!req.file || !owner_address) {
            return res.status(400).json({ error: 'File and owner_address are required.' });
        }

        // --- INICIO DEL PRE-FLIGHT CHECK para MINT ---
        
        console.log(`[Pre-Flight] Checking mint fee requirements for ${owner_address}`);
        await peer.base.update(); // Sincronizar con el estado más reciente de la red

        // 1. Obtener la tarifa de minteo actual de la red.
        const mintFee = protocol.safeBigInt(await protocol.get('mint_fee', '0'));

        // 2. Si hay una tarifa, verificar el saldo del usuario.
        if (mintFee > 0n) {
            console.log(`[Pre-Flight] Mint fee is active: ${protocol.fromBigIntString(mintFee.toString(), 18)} TAP`);
            const userBalance = protocol.safeBigInt(await protocol.get(`internal_balances/${owner_address}`, '0'));

            if (userBalance < mintFee) {
                console.error(`[Pre-Flight Failed] Insufficient funds for mint fee. User has ${userBalance}, needs ${mintFee}.`);
                return res.status(400).json({ 
                    error: 'Insufficient Funds', 
                    details: 'Your internal balance is not enough to pay the minting fee.' 
                });
            }
            console.log(`[Pre-Flight OK] User has sufficient balance to pay the minting fee.`);
        } else {
            console.log(`[Pre-Flight OK] No mint fee is currently active.`);
        }
        
        // --- FIN DEL PRE-FLIGHT CHECK ---

        const { file_id, filename } = await protocol.mintNFTAsOperator(tempFilePath, owner_address);

        // 2. Preparamos la entrada para el log.
        const logEntry = {
            file_id: file_id,
            filename: filename,
            owner_address: owner_address,
            minted_at: new Date().toISOString()
        };

        // 3. Guardamos en el archivo de registro.
        await addToMintLog(logEntry);
        console.log(`[Log] Se ha registrado el mint del ID: ${file_id}`);

        // 4. Respondemos al cliente con la información útil.
        res.json({ 
            success: true, 
            message: 'NFT minted and logged successfully.',
            file_id: file_id,
            filename: filename
        });

    } catch (e) {
        // MANTENEMOS TU MANEJO DE ERRORES
        console.error('[API /api/mint-nft] ERROR:', e);
        if (e.message.includes("Server-side check failed")) {
            return res.status(403).json({ error: 'Authorization Error', details: e.message });
        }
        res.status(500).json({ error: 'Failed to mint NFT', details: e.message });
    } finally {
        // Limpiamos el archivo temporal de la carpeta /uploads
        try {
            await fs.unlink(tempFilePath);
        } catch (e) {
            // Ignoramos errores si el archivo ya no existe
        }
    }
});

    // --- Catch-all Route ---
    server.get('*', (req, res) => {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    });

    server.listen(port, () => {
        console.log(`HTTP Server listening at http://localhost:${port}`);
    });
}

main().catch(error => { console.error("Application failed to start:", error); process.exit(1); });