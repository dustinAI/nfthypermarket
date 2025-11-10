/**
 * CUSTOM DETERMINISTIC JSON SERIALIZATION PROTOCOL
 * 
 * This function ensures identical JSON string output across different JavaScript engines
 * by implementing consistent property ordering and value serialization.
 * 
 * ORDERING ALGORITHM:
 * - Object properties: Sorted alphabetically by key name (lexicographic order)
 * - Arrays: Maintain original index order
 * - Primitives: Standard JSON representation
 * 
 * COMPATIBILITY: Works in both Node.js and browsers
 * DEPENDENCIES: Zero external dependencies
 */

function deterministicStringify(obj) {
    // Track visited objects to detect circular references
    const visited = new WeakSet();
    
    function serialize(value) {
        // Handle null explicitly (typeof null === 'object')
        if (value === null) {
            return 'null';
        }
        
        // Handle primitives
        if (typeof value !== 'object') {
            if (typeof value === 'undefined') {
                throw new Error('Cannot serialize undefined values');
            }
            if (typeof value === 'string') {
                return JSON.stringify(value); // Handles escaping properly
            }
            if (typeof value === 'number') {
                if (!Number.isFinite(value)) {
                    throw new Error('Cannot serialize non-finite numbers');
                }
                return String(value);
            }
            if (typeof value === 'boolean') {
                return String(value);
            }
            // Handle functions, symbols, etc.
            throw new Error(`Cannot serialize value of type: ${typeof value}`);
        }
        
        // Circular reference detection
        if (visited.has(value)) {
            throw new Error('Cannot serialize circular references');
        }
        visited.add(value);
        
        try {
            // Handle arrays
            if (Array.isArray(value)) {
                const elements = value.map(serialize);
                return '[' + elements.join(',') + ']';
            }
            
            // Handle objects
            const keys = Object.keys(value);
            
            // CRITICAL: Sort keys alphabetically for deterministic ordering
            keys.sort();
            
            const pairs = keys.map(key => {
                const serializedKey = JSON.stringify(key);
                const serializedValue = serialize(value[key]);
                return serializedKey + ':' + serializedValue;
            });
            
            return '{' + pairs.join(',') + '}';
            
        } finally {
            // Remove from visited set when done processing this branch
            visited.delete(value);
        }
    }
    
    return serialize(obj);
}

// Export for different environments
if (typeof module !== 'undefined' && module.exports) {
    // Node.js environment
    module.exports = deterministicStringify;
} else if (typeof window !== 'undefined') {
    // Browser environment
    window.deterministicStringify = deterministicStringify;
} else {
    // Other environments (Web Workers, etc.)
    globalThis.deterministicStringify = deterministicStringify;
}

/**
 * INTEGRATION INSTRUCTIONS:
 * 
 * FRONTEND (Browser):
 * 1. Replace the existing json-stable-stringify script tag in index.html:
 *    Remove: <script src="/js/json-stable-stringify.js"></script>
 *    Add: <script src="/js/deterministic-stringify.js"></script>
 * 
 * 2. The existing call in app.js will work without changes:
 *    const commandString = window.deterministicStringify(command);
 * 
 * BACKEND (Node.js):
 * 1. Replace the import in src/api.js:
 *    Remove: import deterministicStringify from 'json-stable-stringify';
 *    Add: const deterministicStringify = require('./deterministic-stringify.js');
 * 
 * 2. The existing call will work without changes:
 *    const commandString = deterministicStringify(command);
 * 
 * FILE PLACEMENT:
 * - Save this code as: public/js/deterministic-stringify.js (for frontend)
 * - Save this code as: src/deterministic-stringify.js (for backend)
 * 
 * TESTING:
 * Both sides should now produce identical output for:
 * {"file_id":"abcdef","op":"transfer_file","to_address":"zzyyxx"}
 * Result: {"file_id":"abcdef","op":"transfer_file","to_address":"zzyyxx"}
 */

/**
 * EDGE CASE HANDLING:
 * 
 * ✅ SUPPORTED:
 * - Nested objects and arrays
 * - Strings with special characters and escapes
 * - Numbers (integers, floats, negatives)
 * - Booleans (true/false)
 * - null values
 * - Empty objects and arrays
 * 
 * ❌ THROWS ERRORS:
 * - undefined values
 * - Circular references
 * - Functions
 * - Symbols
 * - Non-finite numbers (Infinity, -Infinity, NaN)
 * 
 * ORDERING GUARANTEE:
 * Object properties are ALWAYS sorted alphabetically by key name,
 * ensuring {"z": 1, "a": 2} becomes {"a": 2, "z": 1} consistently.
 */

// export default deterministicStringify; //