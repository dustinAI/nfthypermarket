// ARCHIVO: src/main.js

import {getStorePath} from './functions.js';
import {App} from './app.js';
export * from 'trac-peer/src/functions.js'
// --- INICIO DE CAMBIOS ---
import {default as NFTMarketplaceProtocol} from "../contract/NFTMarketplaceProtocol.js";
import {default as NFTMarketplaceContract} from "../contract/NFTMarketplaceContract.js";
// --- FIN DE CAMBIOS ---
import fs from 'fs';

export async function startApp(storageName) {

    console.log('Storage path:', getStorePath());

    const msb_opts = {};
    msb_opts.bootstrap = 'a4951e5f744e2a9ceeb875a7965762481dab0a7bb0531a71568e34bf7abd2c53';
    msb_opts.channel = '0002tracnetworkmainsettlementbus';
    msb_opts.store_name = getStorePath() + '/hypertokens-msb';

    const peer_opts = {};
    // --- INICIO DE CAMBIOS ---
    peer_opts.protocol = NFTMarketplaceProtocol;
    peer_opts.contract = NFTMarketplaceContract;
    peer_opts.bootstrap = '576236c69beaf975854e5b9fba01b5bfe01e39c8ee27fb4cb35fd028bbc8f078'; 
    peer_opts.channel = '000000000000000806nftmarketplace';
    // --- FIN DE CAMBIOS ---
    peer_opts.store_name = getStorePath() + '/nftmarketplace';
    peer_opts.enable_logs = true;
    peer_opts.enable_txlogs = true;
    
    if (storageName) {
        console.log(`Usando almacenamiento personalizado: ${storageName}`);
        peer_opts.store_name = getStorePath() + '/' + storageName;
        msb_opts.store_name = getStorePath() + '/msb-' + storageName;
    }

    // --- Lógica de actualización (sin cambios) ---
    const old_path = getStorePath() + "/trac20";
    const new_path = peer_opts.store_name;
    if(false === fs.existsSync(new_path + '/db') &&
        true === fs.existsSync(old_path + '/db/keypair.json')){
        fs.mkdirSync(new_path, { recursive: true });
        fs.mkdirSync(new_path + '/db', { recursive: true });
        fs.copyFileSync(old_path + '/db/keypair.json', new_path  + '/db/keypair.json');
        fs.rmSync(old_path, { recursive: true, force: true });
    }

    const _old_path = getStorePath() + "/trac20_2";
    const _new_path = peer_opts.store_name;
    if(false === fs.existsSync(_new_path + '/db') &&
        true === fs.existsSync(_old_path + '/db/keypair.json')){
        fs.mkdirSync(_new_path, { recursive: true });
        fs.mkdirSync(_new_path + '/db', { recursive: true });
        fs.copyFileSync(_old_path + '/db/keypair.json', _new_path  + '/db/keypair.json');
        fs.rmSync(_old_path, { recursive: true, force: true });
    }

    const __old_path = getStorePath() + "/hypertokens";
    const __new_path = peer_opts.store_name;
    if(false === fs.existsSync(__new_path + '/db') &&
        true === fs.existsSync(__old_path + '/db/keypair.json')){
        fs.mkdirSync(__new_path, { recursive: true });
        fs.mkdirSync(__new_path + '/db', { recursive: true });
        fs.copyFileSync(__old_path + '/db/keypair.json', __new_path  + '/db/keypair.json');
        fs.rmSync(__old_path, { recursive: true, force: true });
    }
    // --- Fin de la lógica de actualización ---

    const app = new App(msb_opts, peer_opts);
    await app.start();
    
    return app;
}