window.addEventListener('libs-ready', () => {
    // --- DOM Element References ---
    const UIElements = {
        brandTitle: document.getElementById('brand-title'),
        walletWidget: document.getElementById('wallet-widget'),
        connectWalletBtn: document.getElementById('connect-wallet-btn'),
        walletInfo: document.getElementById('wallet-info'),
        walletAddressDisplay: document.getElementById('wallet-address-display'),
        myWalletBtn: document.getElementById('my-wallet-btn'),
        logoutBtn: document.getElementById('logout-btn'),
        collectionsView: document.getElementById('collections-view'),
        myWalletView: document.getElementById('my-wallet-view'),
        collectionsGrid: document.getElementById('collections-grid'),
        myNftsGrid: document.getElementById('my-nfts-grid'),
        backToMarketplaceBtnWallet: document.getElementById('back-to-marketplace-btn-wallet'),
        viewSeedBtn: document.getElementById('view-seed-btn'),
        modalOverlay: document.getElementById('modal-overlay'),
        modalBody: document.getElementById('modal-body'),
        modalClose: document.getElementById('modal-close'),
        templateInitial: document.getElementById('template-initial-options'),
        templateUnlock: document.getElementById('template-unlock-view'),
        templateCreate: document.getElementById('template-create-view'),
        templateRestore: document.getElementById('template-restore-view'),
        templateViewSeed: document.getElementById('template-view-seed'),
        userTapBalance: document.getElementById('user-tap-balance'),
        marketplaceAddress: document.getElementById('marketplace-address'),
        requestWithdrawalBtn: document.getElementById('request-withdrawal-btn'),
        revokeOperatorBtn: document.getElementById('revoke-operator-btn'),
        authorizeOperatorBtn: document.getElementById('authorize-operator-btn'),
        mintNftBtn: document.getElementById('mint-nft-btn'),
        createCollectionBtn: document.getElementById('create-collection-btn'),
        selectUnlistedBtn: document.getElementById('select-unlisted-btn'),
        // New UI Elements for View Management
        viewTitle: document.getElementById('view-title'),
        backToCollectionsBtn: document.getElementById('back-to-collections-btn'),
        forgetWalletBtn: document.getElementById('forget-wallet-btn'),
        collectionLayoutWrapper: document.getElementById('collection-layout-wrapper'),
    };

    // --- Application State ---
    let appState = {
        activeSort: 'default', // Opciones: 'default', 'price_asc', 'price_desc', 'rarity'
        wallet: null,
        listings: [],
        myNfts: [],
        balance: '0.00',
        marketplaceAddress: '',
        isOperatorAuthorized: false,
        currentView: '',
        currentCollectionData: [],
        currentCollectionName: '',
        activeFilters: {},
    };
    
    const API_BASE_URL = window.location.origin;

    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    const walletHandler = {
        generate: async () => {
            const mnemonic = window.bip39.generateMnemonic();
            return await walletHandler.fromMnemonic(mnemonic);
        },
        fromMnemonic: async (mnemonic) => {
            if (!window.bip39.validateMnemonic(mnemonic)) { throw new Error('Invalid seed phrase.'); }
            const seed = window.bip39.mnemonicToSeedSync(mnemonic);
            const seed32 = new Uint8Array(await window.crypto.subtle.digest('SHA-256', seed));
            const keyPair = window.nacl.sign.keyPair.fromSeed(seed32);
            return {
                publicKey: toHexString(keyPair.publicKey),
                secretKey: toHexString(keyPair.secretKey),
                mnemonic: mnemonic
            };
        },
        saveEncrypted: async (wallet, password) => {
            const encryptedMnemonic = await secureEncrypt(wallet.mnemonic, password);
            localStorage.setItem('encryptedWallet', encryptedMnemonic);
        },
        loadDecrypted: async (password) => {
            const encryptedMnemonic = localStorage.getItem('encryptedWallet');
            if (!encryptedMnemonic) return null;
    
            const mnemonic = await secureDecrypt(encryptedMnemonic, password);
    
            if (!mnemonic) {
                throw new Error('Invalid password or corrupted data.');
            }
    
            return await walletHandler.fromMnemonic(mnemonic);
        },
        logout: () => {
            appState.wallet = null;
            appState.myNfts = [];
            appState.balance = '0.00';
            appState.isOperatorAuthorized = false;
            renderCollectionsView();
            updateUI();
        },
        forget: () => {
        // 1. Llama a la función de logout para limpiar el estado de la aplicación
        walletHandler.logout();

        // 2. Elimina la billetera encriptada del almacenamiento del navegador
        localStorage.removeItem('encryptedWallet');

        // 3. (Opcional pero recomendado) Muestra un mensaje al usuario
        alert("Your wallet has been removed from this browser. You can now create a new one or restore another.");

        // 4. Asegúrate de que la UI refleje el estado "sin billetera"
        // La llamada a logout() y updateUI() ya se encarga de esto.
    }
};

    async function getKeyFromPassword(password, salt) {
    const enc = new TextEncoder();
    const keyMaterial = await window.crypto.subtle.importKey(
        'raw',
        enc.encode(password),
        { name: 'PBKDF2' },
        false,
        ['deriveKey']
    );
    return window.crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: salt,
            iterations: 100000, // Número de iteraciones estándar
            hash: 'SHA-256'
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
    );
}


async function secureEncrypt(data, password) {
    const salt = window.crypto.getRandomValues(new Uint8Array(16)); 
    const iv = window.crypto.getRandomValues(new Uint8Array(12)); 
    const key = await getKeyFromPassword(password, salt);
    const enc = new TextEncoder();

    const encryptedContent = await window.crypto.subtle.encrypt(
        {
            name: 'AES-GCM',
            iv: iv
        },
        key,
        enc.encode(data)
    );

    const encryptedBytes = new Uint8Array(encryptedContent);
    
    const resultBuffer = new Uint8Array(salt.length + iv.length + encryptedBytes.length);
    resultBuffer.set(salt, 0);
    resultBuffer.set(iv, salt.length);
    resultBuffer.set(encryptedBytes, salt.length + iv.length);

    
    return btoa(String.fromCharCode.apply(null, resultBuffer));
}


async function secureDecrypt(encryptedDataB64, password) {
    try {
        // Convertimos de Base64 al array de bytes
        const encryptedData = atob(encryptedDataB64).split('').map(c => c.charCodeAt(0));
        const dataArray = new Uint8Array(encryptedData);

        // Extraemos la sal, el IV y los datos cifrados
        const salt = dataArray.slice(0, 16);
        const iv = dataArray.slice(16, 28);
        const encryptedContent = dataArray.slice(28);

        const key = await getKeyFromPassword(password, salt);

        const decryptedContent = await window.crypto.subtle.decrypt(
            {
                name: 'AES-GCM',
                iv: iv
            },
            key,
            encryptedContent
        );

        const dec = new TextDecoder();
        return dec.decode(decryptedContent);
    } catch (e) {
        
        console.error("Descifrado fallido:", e);
        return null;
    }
}

    
    const fromHexString = (hexString) => new Uint8Array(hexString.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
    const toHexString = (byteArray) => Array.from(byteArray, byte => ('0' + (byte & 0xFF).toString(16)).slice(-2)).join('');
    const toBigIntString = (number, decimals) => {
    if (number === null || number === undefined || number === '' || isNaN(parseFloat(number))) return "0";

    const value = String(number);
    decimals = isNaN(decimals) ? 18 : parseInt(decimals);
    
    let [integer, fraction = ''] = value.split('.');

    // Manejar el caso especial de que el número sea solo un punto decimal, como "." o "0."
    if (integer === '' && fraction) integer = '0';

    // Asegurarse de que la fracción no exceda el número de decimales permitidos
    fraction = fraction.substring(0, decimals);
    
    // Rellenar la fracción con ceros hasta alcanzar la longitud de los decimales
    const paddedFraction = fraction.padEnd(decimals, '0');
    
    // Construir el string final, manejando correctamente los casos como "0.05"
    // Si el entero es "0" y el número original era decimal, no incluimos el "0" inicial.
    let fullString;
    if (integer === '0' && value.includes('.')) {
        fullString = paddedFraction;
    } else {
        fullString = integer + paddedFraction;
    }

    // Eliminar ceros a la izquierda del resultado final que no sean el número "0" en sí.
    let result = fullString.replace(/^0+/, '');
    
    return result === '' ? '0' : result;
};

    // --- Marketplace API ---
    const api = {
        getListings: () => fetch(`${API_BASE_URL}/api/listings`).then(res => res.json()),
        getAllListings: () => fetch(`${API_BASE_URL}/api/all-listings`).then(res => res.json()),
        getMyNfts: (address) => fetch(`${API_BASE_URL}/api/my-nfts/${address}`).then(res => res.json()),
        getBalance: (address) => fetch(`${API_BASE_URL}/api/balance/${address}`).then(res => res.json()),
        getMarketplaceAddress: () => fetch(`${API_BASE_URL}/api/marketplace-address`).then(res => res.json()),
        getOperatorAddress: () => fetch(`${API_BASE_URL}/api/operator-address`).then(res => res.json()),
        getCuratedCollections: () => fetch(`${API_BASE_URL}/api/curated-collections`).then(res => res.json()),
        getCuratedCollectionData: (collectionName) => fetch(`${API_BASE_URL}/api/curated-collections/${collectionName}`).then(res => res.json()),
        isOperatorAuthorized: (address) => fetch(`${API_BASE_URL}/api/is-operator-authorized/${address}`).then(res => res.json()),
        getCollections: () => fetch(`${API_BASE_URL}/api/collections`).then(res => res.json()),
        getCollectionDetails: (collectionId) => fetch(`${API_BASE_URL}/api/collection/${collectionId}`).then(res => res.json()),
        async _post(endpoint, body) {
            const response = await fetch(`${API_BASE_URL}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.details || data.error || 'An unknown error occurred.');
            }
            return data;
        },

        executeSignedTx: async (command, wallet) => {
            const nonce = nacl.randomBytes(32);
            const messageToSign = JSON.stringify(command) + toHexString(nonce);
            const signatureBytes = nacl.sign.detached(new TextEncoder().encode(messageToSign), fromHexString(wallet.secretKey));
            
            return api._post('/api/execute-signed-tx', {
                command,
                signature: toHexString(signatureBytes),
                nonce: toHexString(nonce),
                from_address: wallet.publicKey
            });
        },
        
        createCollection: async (formData) => {
            const response = await fetch(`${API_BASE_URL}/api/create-collection`, { 
                method: 'POST', 
                body: formData 
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.details || data.error || "Collection creation failed.");
            return data;
        },

        listNft: (file_id, price, owner_address) => api._post('/api/list-nft', { file_id, price, owner_address }),
        delistNft: (file_id, owner_address) => api._post('/api/delist-nft', { file_id, owner_address }),
        transferNft: (file_id, to_address, owner_address) => api._post('/api/transfer-nft', { file_id, to_address, owner_address }),
        
        buyNft: (file_id, wallet) => {
            const command = { type: 'buy', file_id };
            return api.executeSignedTx(command, wallet);
        },
        
        mintNft: async (formData) => {
            const response = await fetch(`${API_BASE_URL}/api/mint-nft`, { 
                method: 'POST', 
                body: formData 
            });
            
            const data = await response.json();
            if (!response.ok) throw new Error(data.details || data.error || "NFT minting failed.");
            return data;
        }
    };
    
    // --- UI & View Logic ---
    function showView(viewName) {
        UIElements.collectionsView.classList.add('hidden');
        UIElements.myWalletView.classList.add('hidden');
        document.getElementById(`${viewName}-view`).classList.remove('hidden');
    }

    function updateUI() {
        const isLoggedIn = !!appState.wallet;
        UIElements.connectWalletBtn.classList.toggle('hidden', isLoggedIn);
        UIElements.walletInfo.classList.toggle('hidden', !isLoggedIn);
        if (isLoggedIn) {
            const pk = appState.wallet.publicKey;
            UIElements.walletAddressDisplay.textContent = pk;
            UIElements.userTapBalance.textContent = parseFloat(appState.balance).toFixed(4);
            
            UIElements.authorizeOperatorBtn.classList.toggle('hidden', appState.isOperatorAuthorized);
            UIElements.revokeOperatorBtn.classList.toggle('hidden', !appState.isOperatorAuthorized);
            
            const securityInfo = document.getElementById('security-info-text');
            if (securityInfo) securityInfo.textContent = appState.isOperatorAuthorized 
                ? 'The DApp is authorized to act on your behalf.' 
                : 'You must authorize the DApp to list, buy, or mint NFTs.';
        }
    }

    async function refreshWalletData() {
        if (!appState.wallet) return;
        try {
            const [authData, balanceData, myNftsData, marketplaceAddrData] = await Promise.all([
                api.isOperatorAuthorized(appState.wallet.publicKey),
                api.getBalance(appState.wallet.publicKey),
                api.getMyNfts(appState.wallet.publicKey),
                api.getMarketplaceAddress()
            ]);
            appState.isOperatorAuthorized = authData.isAuthorized;
            appState.balance = balanceData.balance;
            appState.myNfts = myNftsData || [];
            appState.marketplaceAddress = marketplaceAddrData.address;
        } catch (e) {
            console.error("Failed to refresh wallet data:", e);
            alert("There was an error updating your wallet data.");
        }
    }

    async function onLogin(wallet) {
        appState.wallet = wallet;
        showLoading("Loading wallet data...");
        try {
            await refreshWalletData();
            updateUI();
        } catch(e) {
            alert("Error loading your wallet data: " + e.message);
        } finally {
            modal.close();
        }
    }
    
    
    async function renderSingleCollectionView(collectionId) {
        showView('collections'); // Reutilizamos la misma vista, pero cambiamos su contenido
        UIElements.collectionsGrid.innerHTML = '<p>Loading collection details...</p>';
        UIElements.backToCollectionsBtn.classList.remove('hidden'); // Mostramos el botón de "volver"

        try {
            const data = await api.getCollectionDetails(collectionId);
            console.log('[DEBUG] Received data from /api/collection:', data);
            if (data.error) throw new Error(data.details || data.error);

            const { collection, items } = data;

            
            UIElements.viewTitle.textContent = collection.collection_name;
            UIElements.collectionsGrid.innerHTML = ''; // Limpiamos el grid para los NFTs

            if (items.length === 0) {
                UIElements.collectionsGrid.innerHTML = '<p>Todavía no hay nada en esta colección.</p>';
                return;
            }

            
            for (const item of items) {
                // La función 'renderNftCard' es perfecta para esto, ya sabe cómo mostrar un NFT
                // y sus botones (Comprar, Vender, etc.) dependiendo del estado.
                renderNftCard(item, UIElements.collectionsGrid, 'collection');
            }

        } catch (e) {
            console.error('[DEBUG] CATCH BLOCK ERROR in renderSingleCollectionView:', e);
            UIElements.collectionsGrid.innerHTML = `<p class="error">Could not load collection: ${e.message}</p>`;
        }
    }
    async function renderCollectionsView() {
        appState.currentView = 'collections';
        showView('collections');
        UIElements.collectionLayoutWrapper.classList.remove('layout-active');
        UIElements.viewTitle.textContent = 'Collections & Marketplace';
        UIElements.backToCollectionsBtn.classList.add('hidden');
        UIElements.collectionsGrid.innerHTML = '<p>Loading...</p>';
        document.getElementById('filters-container').innerHTML = '';

    
        UIElements.collectionsGrid.innerHTML = '';
        const allNftsCard = document.createElement('div');
        allNftsCard.className = 'card';
        allNftsCard.style.cursor = 'pointer';
        allNftsCard.innerHTML = `
            <img src="/images/all-nfts-placeholder.png" alt="All NFTs">
            <div class="card-info">
                <h3>Marketplace</h3>
                <p style="color: var(--text-secondary); font-size: 0.9rem;">Browse all individual NFTs for sale.</p>
            </div>
        `;
        allNftsCard.onclick = () => renderAllListingsView();
        UIElements.collectionsGrid.appendChild(allNftsCard);

    
        try {
            const curatedCollections = await api.getCuratedCollections();
            for (const collection of curatedCollections) {
                const card = document.createElement('div');
                card.className = 'card';
                card.style.cursor = 'pointer';
                card.innerHTML = `
                    <img src="${collection.imageUrl}" alt="${collection.name}">
                    <div class="card-info">
                        <h3>${collection.name}</h3>
                    </div>
                `;
                card.onclick = () => renderCuratedCollectionView(collection.id);
                UIElements.collectionsGrid.appendChild(card);
            }
        } catch (e) {
            console.error("Could not load curated collections:", e.message);
        }
    }
    
    async function renderAllListingsView() {
        appState.currentView = 'marketplace';    
        showView('collections');
        UIElements.collectionLayoutWrapper.classList.remove('layout-active');
        UIElements.viewTitle.textContent = 'Marketplace';
        UIElements.backToCollectionsBtn.classList.remove('hidden');
        UIElements.collectionsGrid.innerHTML = '<p>Loading NFTs for sale...</p>';
        try {
            if (appState.wallet) await refreshWalletData(); 
            const allListings = await api.getListings();
            appState.listings = allListings;
            UIElements.collectionsGrid.innerHTML = '';
            
            if (allListings.length === 0) {
                 UIElements.collectionsGrid.innerHTML = '<p>There are no NFTs for sale right now.</p>';
                 return;
            }
            for (const item of allListings) {
                renderNftCard(item, UIElements.collectionsGrid, 'marketplace');
            }
        } catch (e) { UIElements.collectionsGrid.innerHTML = `<p class="error">Could not load NFTs: ${e.message}</p>`; }
    }
    
    async function renderCuratedCollectionView(collectionName) {
        appState.currentView = 'collection';
        appState.currentCollectionName = collectionName;
        showView('collections');
        UIElements.collectionLayoutWrapper.classList.add('layout-active');
        UIElements.viewTitle.textContent = 'Loading Collection...';
        UIElements.backToCollectionsBtn.classList.remove('hidden');
        UIElements.collectionsGrid.innerHTML = '<p>Loading NFTs...</p>';
        document.getElementById('filters-container').innerHTML = '';

        try {
        // 1. Obtener los datos enriquecidos de la colección
            const collectionData = await api.getCuratedCollectionData(collectionName);
            appState.currentCollectionData = collectionData; // Guardamos los datos completos
            UIElements.viewTitle.textContent = collectionName;

        // 2. Obtener los listados actuales para saber los precios
            const listings = await api.getAllListings(); 
            appState.listings = listings; 

        // 3. Renderizar los filtros y la vista inicial
            renderFilters(collectionData);
            applyFiltersAndRender(); // Esta función ahora se encarga de dibujar los NFTs

        } catch (e) {
            UIElements.collectionsGrid.innerHTML = `<p class="error">Could not load collection: ${e.message}</p>`;
        }
    }

    async function renderMyWalletView() {
        if (!appState.wallet) return;
        appState.currentView = 'wallet';
        showView('my-wallet');
        UIElements.myNftsGrid.innerHTML = '<p>Loading your NFTs...</p>';
        
        await refreshWalletData(); 
        updateUI();

        UIElements.marketplaceAddress.textContent = appState.marketplaceAddress;
        UIElements.myNftsGrid.innerHTML = '';
        console.log("Datos de mis NFTs:", appState.myNfts);
        if (appState.myNfts.length === 0) {
            UIElements.myNftsGrid.innerHTML = '<p>You do not own any NFTs. Mint your first to get started!</p>';
        } else {
            for (const nft of appState.myNfts) {
                renderNftCard(nft, UIElements.myNftsGrid, 'wallet');
            }
        }
    }

    function applyFiltersAndRender() {
        const listingsMap = new Map(appState.listings.map(l => [l.file_id, l]));

        // 1. Unimos la información de la colección con la de los listados (precios)
        let processedData = appState.currentCollectionData.map(item => {
            const nftData = typeof item === 'string' ? { file_id: item } : item;
            const listingInfo = listingsMap.get(nftData.file_id);
            return { ...nftData, ...listingInfo }; // Combina datos de colección y de venta
        });

        // 2. Aplicamos filtros de atributos (como "ojos azules")
        let filteredData = [...processedData];
        for (const trait in appState.activeFilters) {
            if (trait === '_status' || appState.activeFilters[trait].length === 0) continue;

            filteredData = filteredData.filter(nft =>
                nft.attributes && nft.attributes.some(attr => attr.trait_type === trait && appState.activeFilters[trait].includes(attr.value))
            );
        }

        // 3. Aplicamos filtro de estado "For Sale Only"
        if (appState.activeFilters['_status']?.includes('listed')) {
            filteredData = filteredData.filter(nft => listingsMap.has(nft.file_id));
        }
        
        // 4. APLICAMOS LA NUEVA LÓGICA DE ORDENACIÓN
        switch (appState.activeSort) {
            case 'price_asc':
                // Para ordenar correctamente, los no listados (sin precio) van al final.
                filteredData.sort((a, b) => {
                    const priceA = a.price ? parseFloat(a.price) : Infinity;
                    const priceB = b.price ? parseFloat(b.price) : Infinity;
                    return priceA - priceB;
                });
                break;
            case 'price_desc':
                // Los no listados van al final también.
                filteredData.sort((a, b) => {
                    const priceA = a.price ? parseFloat(a.price) : -1;
                    const priceB = b.price ? parseFloat(b.price) : -1;
                    return priceB - priceA;
                });
                break;
            case 'rarity':
                // Los que no tienen ranking van al final.
                filteredData.sort((a, b) => {
                    const rankA = a.rarity_rank ? parseInt(a.rarity_rank) : Infinity;
                    const rankB = b.rarity_rank ? parseInt(b.rarity_rank) : Infinity;
                    return rankA - rankB; // Menor número de rank es más raro.
                });
                break;
            case 'default':
            default:
                // No se hace nada, se mantiene el orden por defecto del manifest.
                break;
        }

        // 5. Renderizar el grid con los datos filtrados y ordenados
        UIElements.collectionsGrid.innerHTML = '';
        if (filteredData.length === 0) {
            UIElements.collectionsGrid.innerHTML = '<p>No items match the current filters.</p>';
            return;
        }

        for (const nft of filteredData) {
            renderNftCard(nft, UIElements.collectionsGrid, 'collection');
        }
    }

    function handleFilterChange(event) {
        // Nos aseguramos de que solo procesamos checkboxes de atributos
        const checkbox = event.target;
        if (checkbox.type !== 'checkbox') return;

        const traitType = checkbox.dataset.trait;
        const value = checkbox.dataset.value;

        if (!appState.activeFilters[traitType]) {
            appState.activeFilters[traitType] = [];
        }

        if (checkbox.checked) {
            // Prevenir duplicados si se llama varias veces
            if (!appState.activeFilters[traitType].includes(value)) {
                appState.activeFilters[traitType].push(value);
            }
        } else {
            const index = appState.activeFilters[traitType].indexOf(value);
            if (index > -1) {
                appState.activeFilters[traitType].splice(index, 1);
            }
        }
        
        applyFiltersAndRender();
    }
    
    function handleForgetWallet() {
   
    const confirmation = confirm(
        "Are you sure you want to forget this wallet?\n\n" +
        "This action will permanently remove the encrypted wallet from this browser's storage. " +
        "You will NOT be able to access it again without your 24-word recovery phrase.\n\n" +
        "This cannot be undone."
    );

    if (confirmation) {
        walletHandler.forget();
    }
}

    function handleSortChange(event) {
        appState.activeSort = event.target.value;
        applyFiltersAndRender();
    }

    function renderFilters(collectionData) {
        const filtersContainer = document.getElementById('filters-container');
        const traits = {};

        // 1. Extraer todos los atributos únicos
        for (const nft of collectionData) {
            if (!nft.attributes) continue;
            for (const attr of nft.attributes) {
                if (!traits[attr.trait_type]) {
                    traits[attr.trait_type] = new Set();
                }
                traits[attr.trait_type].add(attr.value);
            }
        }

        // 2. Construir el HTML del acordeón
        let filtersHTML = '<h3>Filters</h3>';

        // Acordeón para Status (Filtro) y Sort (Ordenación)
        filtersHTML += `
            <div class="accordion-item active"> <!-- Lo dejamos abierto por defecto con 'active' -->
                <button class="accordion-header">
                    <span>Status & Sort</span>
                    <span class="accordion-icon">-</span>
                </button>
                <div class="accordion-content">
                    <div class="filter-option">
                        <input type="checkbox" id="filter-status-listed" data-trait="_status" data-value="listed" ${appState.activeFilters['_status']?.includes('listed') ? 'checked' : ''}>
                        <label for="filter-status-listed">For Sale Only</label>
                    </div>
                    <hr style="margin: 1rem 0;">
                    
                    <!-- NUEVAS OPCIONES DE ORDENACIÓN -->
                    <div class="sort-options-container">
                        <div class="sort-option">
                            <input type="radio" id="sort-default" name="sort-order" value="default" ${appState.activeSort === 'default' ? 'checked' : ''}>
                            <label for="sort-default">Default</label>
                        </div>
                        <div class="sort-option">
                            <input type="radio" id="sort-price-asc" name="sort-order" value="price_asc" ${appState.activeSort === 'price_asc' ? 'checked' : ''}>
                            <label for="sort-price-asc">Price: Low to High</label>
                        </div>
                        <div class="sort-option">
                            <input type="radio" id="sort-price-desc" name="sort-order" value="price_desc" ${appState.activeSort === 'price_desc' ? 'checked' : ''}>
                            <label for="sort-price-desc">Price: High to Low</label>
                        </div>
                        <div class="sort-option">
                            <input type="radio" id="sort-rarity" name="sort-order" value="rarity" ${appState.activeSort === 'rarity' ? 'checked' : ''}>
                            <label for="sort-rarity">Rarity: High to Low</label>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Acordeones para cada Trait (sin cambios)
        for (const trait in traits) {
            filtersHTML += `<div class="accordion-item">`;
            filtersHTML += `
                <button class="accordion-header">
                    <span>${trait}</span>
                    <span class="accordion-icon">+</span>
                </button>
            `;
            filtersHTML += `<div class="accordion-content">`;
            for (const value of traits[trait]) {
                const isChecked = appState.activeFilters[trait]?.includes(value) ? 'checked' : '';
                filtersHTML += `
                    <div class="filter-option">
                        <input type="checkbox" id="${trait}-${value}" data-trait="${trait}" data-value="${value}" ${isChecked}>
                        <label for="${trait}-${value}">${value}</label>
                    </div>
                `;
            }
            filtersHTML += `</div></div>`;
        }

        filtersContainer.innerHTML = filtersHTML;
        
        // Asignar listeners
        filtersContainer.removeEventListener('change', handleFilterChange); // Prevenir duplicados
        filtersContainer.addEventListener('change', handleFilterChange);
        
        const sortRadios = filtersContainer.querySelectorAll('input[name="sort-order"]');
        sortRadios.forEach(radio => {
            radio.addEventListener('change', handleSortChange);
        });

        // Lógica del acordeón (sin cambios)
        const headers = filtersContainer.querySelectorAll('.accordion-header');
        headers.forEach(header => {
            header.addEventListener('click', (event) => {
                event.preventDefault();
                const item = header.parentElement;
                item.classList.toggle('active');
                const icon = header.querySelector('.accordion-icon');
                if (item.classList.contains('active')) {
                    icon.textContent = '-';
                } else {
                    icon.textContent = '+';
                }
            });
        });
    }

    

    function renderNftCard(data, gridElement, context) {
    const { file_id, name, rarity_rank, price } = data;
    const displayName = name || (data.filename) || `NFT-${file_id.substring(0,8)}...`;

    // 1. Crear elementos
    const card = document.createElement('div');
    card.className = 'card nft-card';
    card.style.cursor = 'pointer';

    const img = document.createElement('img');
    img.src = `/api/nft-image/${file_id}`;
    img.alt = displayName; // .alt es seguro

    const cardInfo = document.createElement('div');
    cardInfo.className = 'card-info';

    const cardInfoHeader = document.createElement('div');
    cardInfoHeader.className = 'card-info-header';

    const title = document.createElement('h3');
    title.className = 'card-title';
    title.textContent = displayName; // ✅ SEGURO

    // 2. Añadir elementos al DOM
    cardInfoHeader.appendChild(title);

    if (rarity_rank) {
        const rarityP = document.createElement('p');
        rarityP.className = 'card-rarity';
        rarityP.textContent = `#${rarity_rank}`; // ✅ SEGURO
        cardInfoHeader.appendChild(rarityP);
    }
    
    cardInfo.appendChild(cardInfoHeader);
    
    const isListed = !!price && parseFloat(price) > 0;
    if (isListed) {
        const priceP = document.createElement('p');
        priceP.className = 'card-price';
        priceP.textContent = `${parseFloat(price).toFixed(4)} TAP`; // ✅ SEGURO
        cardInfo.appendChild(priceP);
    }
    
    card.appendChild(img);
    card.appendChild(cardInfo);

    card.addEventListener('click', () => showNftDetailModal(data, context));
    gridElement.appendChild(card);
}
    
    async function showNftDetailModal(data, context) {
    // 1. Clonar la plantilla para obtener el esqueleto del modal
    console.log("Datos recibidos por el modal:", data);
    console.log("Contexto:", context);

    const template = document.getElementById('template-nft-details');
    const modalView = template.content.cloneNode(true);

    // 2. Limpiar el modal e inyectar el nuevo esqueleto
    UIElements.modalBody.innerHTML = '';
    UIElements.modalBody.appendChild(modalView);

    // 3. AHORA, buscar los elementos que ya están en el DOM del modal
    const imageElement = UIElements.modalBody.querySelector('.nft-modal-image-wrapper img');
    const nameElement = UIElements.modalBody.querySelector('.modal-nft-name');
    const rarityElement = UIElements.modalBody.querySelector('.modal-nft-rarity');
    const attributesContainer = UIElements.modalBody.querySelector('.modal-nft-attributes');
    const priceElement = UIElements.modalBody.querySelector('.modal-nft-price');
    const actionsContainer = UIElements.modalBody.querySelector('.modal-nft-actions');

    // 4. Extraer datos del NFT
    const { file_id, name, attributes, rarity_rank, price, seller_address } = data;
    const displayName = name || (data.filename) || `NFT-${file_id.substring(0,8)}...`;

    // 5. Rellenar los elementos (¡ahora sí!)
    imageElement.src = `/api/nft-image/${file_id}`;
    imageElement.alt = displayName;
    nameElement.textContent = displayName;

    if (rarity_rank) {
        rarityElement.textContent = `Rank: #${rarity_rank}`;
        rarityElement.style.display = 'block';
    } else {
        rarityElement.style.display = 'none';
    }

    if (attributes && attributes.length > 0) {
    attributesContainer.innerHTML = ''; // Limpiar el contenedor primero
    attributes.forEach(attr => {
        const tag = document.createElement('div');
        tag.className = 'attribute-tag';

        const strong = document.createElement('strong');
        strong.textContent = `${attr.trait_type}: `; // ✅ SEGURO

        // Usamos un nodo de texto para el valor para evitar que se interprete como HTML
        const valueNode = document.createTextNode(attr.value); // ✅ SEGURO

        tag.appendChild(strong);
        tag.appendChild(valueNode);
        attributesContainer.appendChild(tag);
    });
} else {
    attributesContainer.innerHTML = '<p>No attributes specified.</p>'; // Seguro, es HTML estático
}

    // Lógica para acciones y precio
    const isListed = !!price && parseFloat(price) > 0;
    const isOwner = appState.wallet && data.seller_address && data.seller_address.toLowerCase() === appState.wallet.publicKey.toLowerCase();
    const isOwnerInWallet = context === 'wallet' && !isListed;

    if (isListed) {
        priceElement.textContent = `${parseFloat(price).toFixed(4)} TAP`;
        if (isOwner) {
            const delistBtn = document.createElement('button');
            delistBtn.className = 'button-secondary';
            delistBtn.textContent = 'Delist';
            delistBtn.onclick = () => { modal.close(); handleDelist(file_id, context); };
            actionsContainer.appendChild(delistBtn);
        } else if (appState.wallet) {
            const buyBtn = document.createElement('button');
            buyBtn.className = 'button';
            buyBtn.textContent = 'Buy';
            buyBtn.onclick = () => { modal.close(); handleBuy(file_id); };
            actionsContainer.appendChild(buyBtn);
        }
    } else if (isOwnerInWallet) {
        priceElement.textContent = 'Not listed for sale';
        priceElement.style.color = 'var(--text-secondary)';

        const listBtn = document.createElement('button');
        listBtn.className = 'button';
        listBtn.textContent = 'Sell';
        listBtn.onclick = () => { modal.close(); handleList(file_id); };
        actionsContainer.appendChild(listBtn);

        const transferBtn = document.createElement('button');
        transferBtn.className = 'button-secondary';
        transferBtn.textContent = 'Send';
        transferBtn.onclick = () => { modal.close(); handleTransfer(file_id); };
        actionsContainer.appendChild(transferBtn);
    } else {
         priceElement.textContent = 'Not listed for sale';
         priceElement.style.color = 'var(--text-secondary)';
    }

    // 6. Finalmente, mostrar el modal
    UIElements.modalOverlay.classList.remove('hidden');
}

    async function handleList(file_id) {
        if (!appState.isOperatorAuthorized) return alert("You must authorize the DApp to list NFTs. If you just authorized, please wait a few seconds.");
        const price = prompt(`Enter the sale price for the NFT in TAP:`, "1.0");
        if (!price || isNaN(parseFloat(price)) || parseFloat(price) <= 0) return alert("Invalid price.");
        try {
            showLoading("Submitting request to list your NFT...");
            await api.listNft(file_id, price, appState.wallet.publicKey);
            alert('NFT listed for sale successfully!');
            await renderMyWalletView(); // Always refresh wallet view after listing
        } catch (e) { handleApiError(e); }
        finally { modal.close(); }
    }
    
    async function handleBuy(file_id) {
        if (!appState.wallet) {
            return alert("Please connect your wallet first.");
        }
        if (!appState.isOperatorAuthorized) {
            return alert("You must authorize the DApp before buying NFTs.");
        }
    
        try {
            showLoading("Processing your purchase...");
            await api.buyNft(file_id, appState.wallet);
            alert('NFT purchased successfully!');
            await refreshCurrentView(appState.currentView);  // ✅ Usa el contexto correcto
        } catch (e) {
            handleApiError(e);
        } finally {
            modal.close();
        }
    }

    async function handleDelist(file_id, context) {
        if (!appState.isOperatorAuthorized) return alert("You must authorize the DApp to delist your NFT.");
        if (!confirm("Are you sure you want to remove this NFT from sale?")) return;
        
        try {
            showLoading("Submitting request to delist...");
            await api.delistNft(file_id, appState.wallet.publicKey);
            alert('NFT successfully delisted!');
            await refreshCurrentView(context);
        } catch (e) { handleApiError(e); }
        finally { modal.close(); }
    }

    async function refreshCurrentView(context) {
        switch (context) {
            case 'marketplace':
                await renderAllListingsView();
                break;
            case 'collection':
                if (appState.currentCollectionName) {
                    await renderCuratedCollectionView(appState.currentCollectionName);  // ✅ CORRECTO
                }
                break;
            case 'wallet':
                await renderMyWalletView();
                break;
            default:
                await renderCollectionsView();
        }
    }

    async function handleTransfer(file_id) {
    if (!appState.isOperatorAuthorized) return alert("You must authorize the DApp to send NFTs. If you just authorized, please wait a few seconds.");
    
    const to_address = prompt(`Enter the destination wallet address:`);
    if (!to_address || to_address.length !== 64) return alert("Invalid destination address.");
    // Si el usuario cancela el prompt, to_address será null. Salimos de la función.
    if (!to_address) return;

    try {
        // Tarea 1: Mostrar la ventana de "cargando".
        showLoading("Transferring your NFT...");

        // Tarea 2: Realizar la transferencia.
        await api.transferNft(file_id, to_address, appState.wallet.publicKey);

        // TAREA 3 (NUEVO ORDEN): ¡Cerrar la ventana AHORA!
        modal.close();

        // Tarea 4: Notificar al usuario que todo salió bien.
        alert('NFT transferred successfully! Your wallet is now updating.');

        // Tarea 5: Actualizar la vista en segundo plano.
        // El usuario ya no está atrapado en la pantalla de carga.
        await renderMyWalletView();
        
    } catch (e) {
        // En caso de error, también cerramos la ventana antes de mostrar el mensaje.
        modal.close();
        // handleApiError(e); // O tu manejo de errores preferido
        alert("Transfer failed: " + (e.message || e));
    }
    // El bloque 'finally' ya no es necesario para cerrar el modal.
}

    async function handleMint() {
        if (!appState.isOperatorAuthorized) {
            return alert("You must authorize the DApp to mint NFTs. If you just authorized, please wait a few seconds.");
        }
    
        const fileInput = document.getElementById('mint-file-input');
        if (!fileInput || !fileInput.files.length) {
            return alert("Please select a file.");
        }
    
        const formData = new FormData();
        formData.append('nftFile', fileInput.files[0]);
        formData.append('owner_address', appState.wallet.publicKey);
    
        try {
            showLoading("Minting your new NFT... This may take a moment.");
            await api.mintNft(formData);
            alert('NFT minted successfully!');
            fileInput.value = '';
            showLoading("Updating your wallet...");
            await renderMyWalletView();
        } catch (e) {
            handleApiError(e);
        } finally {
            modal.close();
        }
    }

    async function handleRequestWithdrawal() {
    const amount = document.getElementById('withdrawal-amount').value.trim();
    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) return alert("Invalid amount.");

    
    const convertWithdrawalAmount = (value, decimals) => {
        if (!value || isNaN(parseFloat(value))) return "0";
        let strValue = String(value);
        let [integer, fraction = ""] = strValue.split(".");
        fraction = fraction.substring(0, decimals);
        const paddedFraction = fraction.padEnd(decimals, "0");
        const fullString = (integer === '0' && strValue !== '0') ? paddedFraction : integer + paddedFraction;
        return fullString.replace(/^0+/, '') || "0";
    };
    
    try {
        showLoading("Submitting withdrawal request...");
        // Se usa la nueva función de conversión local en lugar de la global.
        const command = { type: 'requestWithdrawal', amount: convertWithdrawalAmount(amount, 18) };
        await api.executeSignedTx(command, appState.wallet);
        alert("Withdrawal request sent.");
        document.getElementById('withdrawal-amount').value = '';
        await renderMyWalletView();
    } catch(e) { handleApiError(e); }
    finally { modal.close(); }
}
    
    async function handleAuthorizeOperator() {
    try {
        showLoading("Sending authorization transaction to the network...");

        
        const operatorAddressData = await api.getOperatorAddress();
        if (!operatorAddressData || !operatorAddressData.address) {
            throw new Error("Could not retrieve the operator address from the server.");
        }

        
        const command = { type: 'addOperator', operator_address: operatorAddressData.address };

        await api.executeSignedTx(command, appState.wallet);
        appState.isOperatorAuthorized = true;
        updateUI();
        modal.close();
        alert("Authorization request sent. The network may take a few seconds to confirm it. You can now try using the marketplace features.");
    } catch(e) {
        modal.close();
        alert("Error sending authorization request: " + e.message);
    }
}

    async function handleRemoveOperator() {
        if (!confirm("Are you sure you want to revoke the DApp's permission? You will not be able to list, delist, or mint NFTs until you re-authorize it.")) return;
        try {
            showLoading("Sending transaction to revoke permission...");
            const command = { type: 'removeOperator' };
            await api.executeSignedTx(command, appState.wallet);
            appState.isOperatorAuthorized = false;
            updateUI();
            modal.close();
            alert("Permission revoked successfully.");
        } catch(e) {
            modal.close();
            alert("Error revoking permission: " + e.message);
        }
    }
    
    
    const modal = {
        open: (content) => {
            UIElements.modalBody.innerHTML = '';
            // Si el 'content' es una plantilla, clona su contenido.
            // Si no, es porque ya es un contenido listo para usar.
            const contentNode = content.tagName === 'TEMPLATE'
                ? content.content.cloneNode(true)
                : content;
            UIElements.modalBody.appendChild(contentNode);
            UIElements.modalOverlay.classList.remove('hidden');
            modal.addEventListeners();
        },
        close: () => UIElements.modalOverlay.classList.add('hidden'),
        addEventListeners: () => {
            const createBtn = UIElements.modalBody.querySelector('#create-wallet-btn');
            if (createBtn) createBtn.addEventListener('click', handleCreateWallet);
            const confirmCreateCollectionBtn = UIElements.modalBody.querySelector('#confirm-create-collection-btn');
            if (confirmCreateCollectionBtn) confirmCreateCollectionBtn.addEventListener('click', handleConfirmCreateCollection);
            const restoreBtn = UIElements.modalBody.querySelector('#restore-wallet-btn');
            if (restoreBtn) restoreBtn.addEventListener('click', () => modal.open(UIElements.templateRestore));
            const unlockBtn = UIElements.modalBody.querySelector('#unlock-btn');
            if (unlockBtn) unlockBtn.addEventListener('click', handleUnlock);
            const confirmCreateBtn = UIElements.modalBody.querySelector('#confirm-creation-btn');
            if (confirmCreateBtn) confirmCreateBtn.addEventListener('click', handleConfirmCreation);
            const confirmRestoreBtn = UIElements.modalBody.querySelector('#confirm-restore-btn');
            if (confirmRestoreBtn) confirmRestoreBtn.addEventListener('click', handleConfirmRestore);
            const confirmViewSeedBtn = UIElements.modalBody.querySelector('#confirm-view-seed-btn');
            if (confirmViewSeedBtn) confirmViewSeedBtn.addEventListener('click', handleConfirmViewSeed);
        },
        displayError: (message) => {
            const errorEl = UIElements.modalBody.querySelector('.error');
            if (errorEl) errorEl.textContent = message;
        }
    };

    async function handleCreateWallet() {
        try {
            showLoading("Creating your new wallet...");
            const newWallet = await walletHandler.generate();
            appState.wallet = newWallet;
            modal.open(UIElements.templateCreate);
            UIElements.modalBody.querySelector('#mnemonic-display').textContent = newWallet.mnemonic;
        } catch (e) { modal.displayError(e.message); }
    }

    async function handleUnlock() {
        const passwordInput = UIElements.modalBody.querySelector('#unlock-password');
        try {
            await onLogin(await walletHandler.loadDecrypted(passwordInput.value));
        } catch (e) {
            modal.open(UIElements.templateUnlock);
            modal.displayError(e.message);
        }
    }

    async function handleConfirmCreation() { // <-- AÑADIDO 'async'
        const password = UIElements.modalBody.querySelector('#create-password').value;
        if (password.length < 8) return modal.displayError('Password must be at least 8 characters.');
        await walletHandler.saveEncrypted(appState.wallet, password); // <-- AÑADIDO 'await'
        onLogin(appState.wallet);
    }

    async function handleConfirmRestore() {
        const mnemonic = UIElements.modalBody.querySelector('#restore-mnemonic').value.trim();
        const password = UIElements.modalBody.querySelector('#restore-password').value;
        try {
            if (password.length < 8) return modal.displayError('Password must be at least 8 characters.');
            const wallet = await walletHandler.fromMnemonic(mnemonic);
            await walletHandler.saveEncrypted(wallet, password);
            await onLogin(wallet);
        } catch (e) {
            modal.open(UIElements.templateRestore);
            modal.displayError(e.message);
        }
    }
    function handleShowCreateCollectionForm() {
        if (!appState.wallet) return alert('You must be logged in to create a collection.');
        // Usamos el sistema de modales que ya tienes
        modal.open(document.getElementById('template-create-collection'));
    }

    async function handleConfirmCreateCollection() {
        // Obtenemos los datos del formulario en el modal
        const name = UIElements.modalBody.querySelector('#collection-name').value.trim();
        const description = UIElements.modalBody.querySelector('#collection-description').value.trim();
        const bannerInput = UIElements.modalBody.querySelector('#collection-banner');
        const manifestInput = UIElements.modalBody.querySelector('#collection-manifest');

        // Validaciones
        if (!name || !description) return modal.displayError('Name and description are required.');
        if (!bannerInput.files.length) return modal.displayError('A banner image is required.');
        if (!manifestInput.files.length) return modal.displayError('A manifest file is required.');

        // Construimos el FormData para enviar los archivos y datos
        const formData = new FormData();
        formData.append('owner_address', appState.wallet.publicKey);
        formData.append('name', name);
        formData.append('description', description);
        formData.append('bannerFile', bannerInput.files[0]);
        formData.append('manifestFile', manifestInput.files[0]);

        try {
            showLoading("Creating your new collection... This may take a moment as files are minted.");
            await api.createCollection(formData);
            alert("Collection created successfully!");
            modal.close();
            // Refrescar la vista de colecciones para ver la nueva
            await renderCollectionsView(); 
        } catch (e) {
            modal.open(document.getElementById('template-create-collection')); // Reabre el modal en caso de error
            modal.displayError(e.message);
        }
    } 
    function handleViewSeed() {
        if (!appState.wallet) return alert('Please connect your wallet first.');
        modal.open(UIElements.templateViewSeed);
    }

    async function handleConfirmViewSeed() {
        const password = UIElements.modalBody.querySelector('#view-seed-password').value;
        try {
            const decryptedWallet = await walletHandler.loadDecrypted(password);
            if (decryptedWallet.publicKey === appState.wallet.publicKey) {
                UIElements.modalBody.querySelector('#seed-phrase-display').textContent = decryptedWallet.mnemonic;
                UIElements.modalBody.querySelector('#seed-phrase-container').classList.remove('hidden');
            }
        } catch (e) { modal.displayError("Incorrect password."); }
    }
    
    function showLoading(message) {
        UIElements.modalBody.innerHTML = `<p>${message}</p><div class="loader"></div>`;
        UIElements.modalOverlay.classList.remove('hidden');
    }
    
    async function pollServerStatus() {
        const statusElement = document.getElementById('status-message');
        if (statusElement) statusElement.textContent = 'Connecting to the P2P network...';
        try {
            const response = await fetch('/api/status');
            if (!response.ok) throw new Error(`Server responded with status: ${response.status}`);
            const data = await response.json();
            if (data.ready) {
                if (statusElement) statusElement.textContent = 'Connected.';
                setTimeout(() => { if (statusElement) statusElement.style.display = 'none'; }, 2000);
                renderCollectionsView();
            } else {
                setTimeout(pollServerStatus, 2000);
            }
        } catch (error) {
            if (statusElement) statusElement.textContent = 'Connection error. Retrying...';
            console.error("Error in pollServerStatus:", error);
            setTimeout(pollServerStatus, 2000);
        }
    }

    // --- Initialization & Event Listeners ---
    function init() {
        UIElements.brandTitle.addEventListener('click', renderCollectionsView);
        UIElements.connectWalletBtn.addEventListener('click', () => {
            const encryptedWallet = localStorage.getItem('encryptedWallet');
            modal.open(encryptedWallet ? UIElements.templateUnlock : UIElements.templateInitial);
        });
        UIElements.modalClose.addEventListener('click', modal.close);
        // UIElements.createCollectionBtn.addEventListener('click', handleShowCreateCollectionForm); //
        UIElements.logoutBtn.addEventListener('click', walletHandler.logout);
        UIElements.myWalletBtn.addEventListener('click', renderMyWalletView);
        UIElements.backToMarketplaceBtnWallet.addEventListener('click', renderCollectionsView);
        UIElements.backToCollectionsBtn.addEventListener('click', renderCollectionsView);
        UIElements.viewSeedBtn.addEventListener('click', handleViewSeed);
        UIElements.requestWithdrawalBtn.addEventListener('click', handleRequestWithdrawal);
        UIElements.authorizeOperatorBtn.addEventListener('click', handleAuthorizeOperator);
        UIElements.revokeOperatorBtn.addEventListener('click', handleRemoveOperator);
        UIElements.mintNftBtn.addEventListener('click', handleMint);
        UIElements.forgetWalletBtn.addEventListener('click', handleForgetWallet);
        
        
        
        updateUI();
        pollServerStatus();
    }
    
    init();
});