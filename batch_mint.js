import fs from 'fs/promises';
import path from 'path';
import FormData from 'form-data';
import fetch from 'node-fetch';

// =================================================================
// --- CONFIGURACIÓN ---
// =================================================================
const OWNER_ADDRESS = 'yourhypertokenowneraddres';
const API_BASE_URL = 'http://127.0.0.1:3000';
const DELAY_BETWEEN_MINTS_MS = 3100;
const LOG_FILE = './mint_log.json'; 

// =================================================================

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));


async function loadProcessedFiles() {
    try {
        const logContent = await fs.readFile(LOG_FILE, 'utf-8');
        const processed = JSON.parse(logContent);
        return new Set(processed); // Usamos un Set para búsquedas rápidas
    } catch (error) {
        // Si el archivo no existe o está vacío, es la primera ejecución.
        if (error.code === 'ENOENT') {
            return new Set();
        }
        console.error("Warning: Could not read log file. Starting from scratch.", error);
        return new Set();
    }
}


async function logProcessedFile(filename) {
    const processed = await loadProcessedFiles();
    processed.add(filename);
    await fs.writeFile(LOG_FILE, JSON.stringify(Array.from(processed), null, 2));
}

async function main() {
    const imagesDirArg = process.argv.slice(2)[0];
    if (!imagesDirArg) {
        console.error('❌ ERROR: Debes proporcionar la ruta a la carpeta de imágenes.');
        return;
    }
    const IMAGES_DIR = path.resolve(imagesDirArg);

    if (OWNER_ADDRESS === 'PON_AQUÍ_LA_DIRECCIÓN_DEL_DUEÑO') {
        console.error('❌ ERROR: Por favor, edita el script y establece la variable OWNER_ADDRESS.');
        return;
    }

    console.log('🚀 Iniciando el proceso de minteo en lote (modo resumible)...');
    
    
    const processedFiles = await loadProcessedFiles();
    console.log(`- ${processedFiles.size} archivos ya habían sido minteados y serán omitidos.`);

    try {
        const allImageFiles = await fs.readdir(IMAGES_DIR);
        const imageFilesToProcess = allImageFiles.filter(
            f => (f.endsWith('.png') || f.endsWith('.jpg')) && !processedFiles.has(f)
        );

        if (imageFilesToProcess.length === 0) {
            console.log('✅ ¡Todo listo! No hay nuevos archivos para mintear.');
            return;
        }

        console.log(`- Se encontraron ${imageFilesToProcess.length} nuevas imágenes para mintear.`);
        
        let successCount = 0;
        let errorCount = 0;

        for (let i = 0; i < imageFilesToProcess.length; i++) {
            const filename = imageFilesToProcess[i];
            const filePath = path.join(IMAGES_DIR, filename);

            console.log(`\n--- Minteando [${i + 1}/${imageFilesToProcess.length}]: ${filename} ---`);

            try {
                const form = new FormData();
                const fileStream = await fs.readFile(filePath);
                form.append('nftFile', fileStream, filename);
                form.append('owner_address', OWNER_ADDRESS);

                const response = await fetch(`${API_BASE_URL}/api/mint-nft`, {
                    method: 'POST', body: form, headers: form.getHeaders ? form.getHeaders() : {}
                });

                const result = await response.json();
                if (!response.ok) throw new Error(result.details || result.error || 'Respuesta de API no exitosa');
                
                console.log(`  ✅ ÉXITO: ${filename} minteado correctamente.`);
                // 2. Registrar el éxito en el archivo de log
                await logProcessedFile(filename);
                successCount++;

            } catch (error) {
                console.error(`  ❌ ERROR al mintear ${filename}:`, error.message);
                errorCount++;
            }
            await sleep(DELAY_BETWEEN_MINTS_MS);
        }

        console.log('\n\n✨ Proceso de Minteo Finalizado ✨');
        console.log(`- Exitosos en esta sesión: ${successCount}`);
        console.log(`- Fallidos en esta sesión: ${errorCount}`);

    } catch (error) {
        console.error('\n\n❌ ¡ERROR FATAL!:', error.message);
    }
}

main();