import ReadyResource from "ready-resource";
import {Peer, Wallet} from "trac-peer";
import {MainSettlementBus} from 'trac-msb/src/index.js';

export class App extends ReadyResource {
    constructor(msb_opts, peer_opts, features = []) {
        super();
        this.msb = null;
        this.peer = null;
        this.features = features;
        this.msb_opts = msb_opts;
        this.peer_opts = peer_opts;

        
        
        this._resolveFeaturesLoaded = null;
        this.featuresLoadedPromise = new Promise(resolve => {
            this._resolveFeaturesLoaded = resolve;
        });
        
    }

    async _loadFeaturesInBackground() {
        try {
            console.log('[Features] Iniciando carga de features en segundo plano...');
            
            const getAdminPromise = this.peer.base.view.get('admin');
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('La lectura de la clave admin superó los 30 segundos de espera')), 30000)
            );
            
            const admin = await Promise.race([getAdminPromise, timeoutPromise]);
            console.log('[Features] Clave de admin leída. Procesando features...');

            if (this.features && this.features.length > 0) {
                for(let i = 0; i < this.features.length; i++){
                    if(this.features[i].noadmin === true || (null !== admin && this.peer.wallet.publicKey === admin.value && this.peer.base.writable)) {
                        const name = this.features[i].name;
                        const _class = this.features[i].class;
                        const opts = this.features[i].opts;
                        const obj = new _class(this.peer, opts);
                        await this.peer.protocol_instance.addFeature(name, obj);
                        obj.start();
                        console.log(`[Features] Feature '${name}' iniciada.`);
                    } else {
                        console.log(`[Features] Omitiendo feature '${this.features[i].name}' por falta de permisos de admin.`);
                    }
                }
            }
        } catch (error) {
            console.warn(`[ADVERTENCIA] No se pudieron cargar las features de admin. Razón: ${error.message}`);
        } finally {
            // --- INICIO DE LA SOLUCIÓN ---
            // Se resuelva o no, informamos que el proceso ha terminado cumpliendo la promesa.
            console.log('[Features] Proceso de carga de features finalizado.');
            this._resolveFeaturesLoaded();
            // --- FIN DE LA SOLUCIÓN ---
        }
    }

    async start(){
        this.msb_opts.stores_directory = '';
        this.msb_opts.enable_wallet = false;
        this.msb_opts.enable_updater = false;
        this.msb_opts.enable_interactive_mode = false;
        console.log('=============== STARTING MSB ===============');
        this.msb = new MainSettlementBus(this.msb_opts);
        await this.msb.ready();
        
        console.log('=============== STARTING PEER ===============');
        this.peer_opts.stores_directory = '';
        this.peer_opts.msb = this.msb;
        this.peer_opts.wallet = new Wallet();
        this.peer = new Peer(this.peer_opts);
        await this.peer.ready();
        console.log('Peer is ready.');
        
        const _this = this;
        _this.ready().catch(function(err){
            console.error("Error en la promesa _this.ready():", err);
        });

        this._loadFeaturesInBackground();
    }

    getPeer(){
        return this.peer;
    }
}
