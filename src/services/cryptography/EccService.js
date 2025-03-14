import { secp256k1 } from '@noble/curves/secp256k1';
import { bytesToHex, hexToBytes, utf8ToBytes, concatBytes } from '@noble/hashes/utils';
import { sha256 } from '@noble/hashes/sha256';
import { randomBytes } from '@noble/hashes/utils';

// Use the built-in Web Crypto API
const crypto = window.crypto;

/**
 * Service for ECC cryptography operations using secure libraries
 */
class EccService {
  /**
   * Generate a new ECC key pair
   * @returns {Object} Object containing privateKey and publicKey in hex format
   */
  static generateKeyPair() {
    try {
      // Generate random private key
      const privateKey = secp256k1.utils.randomPrivateKey();
      
      // Derive public key (uncompressed format)
      const publicKey = secp256k1.getPublicKey(privateKey, false);
      
      return {
        privateKey: bytesToHex(privateKey),
        publicKey: bytesToHex(publicKey)
      };
    } catch (error) {
      console.error("Error generating ECC key pair:", error);
      throw error;
    }
  }
  
  /**
   * Import a key pair from private key
   * @param {string} privateKeyHex - Private key in hex format
   * @returns {Object} Object containing privateKey and publicKey in hex format
   */
  static importFromPrivateKey(privateKeyHex) {
    try {
      const privateKey = hexToBytes(privateKeyHex);
      const publicKey = secp256k1.getPublicKey(privateKey, false);
      
      return {
        privateKey: privateKeyHex,
        publicKey: bytesToHex(publicKey)
      };
    } catch (error) {
      console.error("Error importing ECC key pair:", error);
      throw error;
    }
  }
  
  /**
   * Encrypt a message with a public key
   * @param {string} publicKeyHex - Public key in hex format
   * @param {string} message - Plain text message to encrypt
   * @returns {Object} Encrypted data object with iv, ephemPublicKey, ciphertext, and mac
   */
  static async encrypt(publicKeyHex, message) {
    try {
      // Convert inputs to proper format
      const publicKey = hexToBytes(publicKeyHex);
      const messageBytes = utf8ToBytes(message);
      
      // Generate ephemeral key pair for this encryption
      const ephemeralPrivateKey = secp256k1.utils.randomPrivateKey();
      const ephemeralPublicKey = secp256k1.getPublicKey(ephemeralPrivateKey, false);
      
      // Compute shared secret using ECDH
      const sharedPoint = secp256k1.getSharedSecret(ephemeralPrivateKey, publicKey);
      // Take the x coordinate of the shared point (first 32 bytes) and hash it
      const sharedSecret = sha256(sharedPoint.slice(1, 33));
      
      // Generate a random IV
      const iv = crypto.getRandomValues(new Uint8Array(16));
      
      // Use the Web Crypto API for AES encryption
      const key = await crypto.subtle.importKey(
        'raw',
        sharedSecret,
        { name: 'AES-GCM' },
        false,
        ['encrypt']
      );
      
      const encryptedBuffer = await crypto.subtle.encrypt(
        {
          name: 'AES-GCM',
          iv,
          tagLength: 128 // 16 bytes
        },
        key,
        messageBytes
      );
      
      // In AES-GCM, the authentication tag is appended to the ciphertext
      const encryptedArray = new Uint8Array(encryptedBuffer);
      const ciphertextLength = encryptedArray.length - 16; // Last 16 bytes are the MAC
      const ciphertext = encryptedArray.slice(0, ciphertextLength);
      const mac = encryptedArray.slice(ciphertextLength);
      
      // Format the result to match the previous API structure
      return {
        iv: bytesToHex(iv),
        ephemPublicKey: bytesToHex(ephemeralPublicKey),
        ciphertext: bytesToHex(ciphertext),
        mac: bytesToHex(mac)
      };
    } catch (error) {
      console.error("Error encrypting message:", error);
      throw error;
    }
  }
  
  /**
   * Decrypt a message with a private key
   * @param {string} privateKeyHex - Private key in hex format
   * @param {Object} encryptedData - Encrypted data object
   * @returns {string} Decrypted message
   */
  static async decrypt(privateKeyHex, encryptedData) {
    try {
      // Convert inputs to proper format
      const privateKey = hexToBytes(privateKeyHex);
      const iv = hexToBytes(encryptedData.iv);
      const ephemPublicKey = hexToBytes(encryptedData.ephemPublicKey);
      const ciphertext = hexToBytes(encryptedData.ciphertext);
      const mac = hexToBytes(encryptedData.mac);
      
      // Compute shared secret using ECDH
      const sharedPoint = secp256k1.getSharedSecret(privateKey, ephemPublicKey);
      // Take the x coordinate of the shared point (first 32 bytes) and hash it
      const sharedSecret = sha256(sharedPoint.slice(1, 33));
      
      // Import the shared secret as an AES key
      const key = await crypto.subtle.importKey(
        'raw',
        sharedSecret,
        { name: 'AES-GCM' },
        false,
        ['decrypt']
      );
      
      // Combine ciphertext and MAC for decryption
      const encryptedData = concatBytes(ciphertext, mac);
      
      try {
        // Decrypt
        const decryptedBuffer = await crypto.subtle.decrypt(
          {
            name: 'AES-GCM',
            iv,
            tagLength: 128 // 16 bytes
          },
          key,
          encryptedData
        );
        
        const decrypted = new Uint8Array(decryptedBuffer);
        return new TextDecoder().decode(decrypted);
      } catch (error) {
        throw new Error('Decryption failed: Invalid ciphertext or MAC');
      }
    } catch (error) {
      console.error("Error decrypting message:", error);
      throw error;
    }
  }
  
  /**
   * Format encrypted data as a single hex string for contract storage
   * @param {Object} encryptedData - Encrypted data object
   * @returns {string} Concatenated hex string with 0x prefix
   */
  static formatForContract(encryptedData) {
    // Concatenate all parts of the encrypted data
    const combinedHex = 
      encryptedData.iv +
      encryptedData.ephemPublicKey +
      encryptedData.ciphertext +
      encryptedData.mac;
    
    return '0x' + combinedHex;
  }
  
  /**
   * Parse a concatenated hex string from contract into encrypted data components
   * @param {string} hexString - Concatenated hex string
   * @returns {Object} Encrypted data object
   */
  static parseFromContract(hexString) {
    // Remove '0x' prefix if present
    const hex = hexString.startsWith('0x') ? hexString.substring(2) : hexString;
    
    // Define sizes in bytes (converted to hex characters, so *2)
    const IV_SIZE = 16 * 2; // 16 bytes = 32 hex chars
    const EPHEM_KEY_SIZE = 65 * 2; // 65 bytes = 130 hex chars for uncompressed key
    const MAC_SIZE = 16 * 2; // 16 bytes = 32 hex chars
    
    // Extract components
    const iv = hex.substring(0, IV_SIZE);
    const ephemPublicKey = hex.substring(IV_SIZE, IV_SIZE + EPHEM_KEY_SIZE);
    const macStart = hex.length - MAC_SIZE;
    const ciphertext = hex.substring(IV_SIZE + EPHEM_KEY_SIZE, macStart);
    const mac = hex.substring(macStart);
    
    return {
      iv,
      ephemPublicKey,
      ciphertext,
      mac
    };
  }
  
  /**
   * Sign a message with private key
   * @param {string} privateKeyHex - Private key in hex format
   * @param {string} message - Message to sign
   * @returns {string} Signature in hex format
   */
  static sign(privateKeyHex, message) {
    try {
      const privateKey = hexToBytes(privateKeyHex);
      const messageHash = sha256(utf8ToBytes(message));
      
      // Sign the message hash
      const signature = secp256k1.sign(messageHash, privateKey);
      return signature.toCompactHex();
    } catch (error) {
      console.error("Error signing message:", error);
      throw error;
    }
  }
  
  /**
   * Verify a signature
   * @param {string} publicKeyHex - Public key in hex format
   * @param {string} message - Original message
   * @param {string} signatureHex - Signature in hex format
   * @returns {boolean} True if signature is valid
   */
  static verify(publicKeyHex, message, signatureHex) {
    try {
      const publicKey = hexToBytes(publicKeyHex);
      const messageHash = sha256(utf8ToBytes(message));
      
      // Parse the signature
      const signature = secp256k1.Signature.fromCompact(signatureHex);
      
      // Verify the signature
      return secp256k1.verify(signature, messageHash, publicKey);
    } catch (error) {
      console.error("Error verifying signature:", error);
      return false;
    }
  }
  
  /**
   * Derive a shared secret from a private key and a public key
   * @param {string} privateKeyHex - Private key in hex format
   * @param {string} publicKeyHex - Public key in hex format
   * @returns {string} Shared secret in hex format
   */
  static deriveSharedSecret(privateKeyHex, publicKeyHex) {
    try {
      const privateKey = hexToBytes(privateKeyHex);
      const publicKey = hexToBytes(publicKeyHex);
      
      // Compute shared secret using ECDH
      const sharedPoint = secp256k1.getSharedSecret(privateKey, publicKey);
      // Take the x coordinate and hash it
      const sharedSecret = sha256(sharedPoint.slice(1, 33));
      
      return bytesToHex(sharedSecret);
    } catch (error) {
      console.error("Error deriving shared secret:", error);
      throw error;
    }
  }
}

export default EccService;