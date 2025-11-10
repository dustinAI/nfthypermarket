// EN: public/libs.js

// Esta función asíncrona se ejecutará inmediatamente.
(async () => {
  try {
    // Importa las funciones necesarias desde esm.sh
    const { generateMnemonic, validateMnemonic, mnemonicToSeedSync } = await import('https://esm.sh/@scure/bip39@1.2.1');
    const { wordlist } = await import('https://esm.sh/@scure/bip39@1.2.1/wordlists/english');
    
    // Crea el objeto `bip39` en la ventana global para que `app.js` pueda usarlo.
    window.bip39 = {
      generateMnemonic: (entropy) => generateMnemonic(wordlist, entropy || 256), // 256 bits = 24 palabras
      validateMnemonic: (mnemonic) => validateMnemonic(mnemonic, wordlist),
      mnemonicToSeedSync: (mnemonic) => mnemonicToSeedSync(mnemonic)
    };
    
    console.log('✅ BIP39 (scure) listo.');
    
    // Dispara un evento personalizado para notificar que las librerías están listas.
    document.dispatchEvent(new Event('libs-ready'));
    
  } catch (error) {
    console.error("Error al cargar las librerías criptográficas:", error);
    // Podríamos mostrar un mensaje de error al usuario aquí.
  }
})();