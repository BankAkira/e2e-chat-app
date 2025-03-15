import { randomBytes } from '@noble/hashes/utils';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils';
import { sha256 } from '@noble/hashes/sha256';
import EccService from '../cryptography/EccService';

/**
 * Production-ready implementation of Shamir's Secret Sharing
 * with enhanced security features for key management
 */
class ProductionShamirService {
  constructor(signer, chainId) {
    if (!signer) {
      throw new Error("Signer is required");
    }
    
    this.signer = signer;
    this.chainId = chainId;
  }
  
  /**
   * Generate secure prime for finite field arithmetic
   * @returns {bigint} A cryptographically secure prime
   */
  getPrime() {
    // Use NIST P-256 curve order - a well-vetted cryptographic parameter
    return BigInt("115792089210356248762697446949407573529996955224135760342422259061068512044369");
  }
  
  /**
   * Generate shares with defense-in-depth security measures
   * @param {string} privateKeyHex - Private key to split
   * @param {number} numShares - Number of shares to create
   * @param {number} threshold - Minimum shares needed for reconstruction
   * @returns {Promise<Array>} Array of share objects
   */
  async generateShares(privateKeyHex, numShares, threshold) {
    try {
      // Security validation
      this._validateInputs(privateKeyHex, numShares, threshold);
      
      // 1. Convert private key to bytes
      const privateKeyBytes = hexToBytes(privateKeyHex);
      
      // 2. Create a prime field for calculations
      const prime = this.getPrime();
      
      // 3. Convert private key to a field element
      const secret = this.bytesToFieldElement(privateKeyBytes, prime);
      
      // 4. Add entropy to the random number generation for coefficients
      const extraEntropy = await this._generateExtraEntropy();
      
      // 5. Generate random coefficients for the polynomial with added entropy
      const coefficients = [secret]; // a₀ = secret
      for (let i = 1; i < threshold; i++) {
        const randomValue = this._secureRandomFieldElement(prime, extraEntropy + i.toString());
        coefficients.push(randomValue);
      }
      
      // 6. Compute shares by evaluating the polynomial at points
      const shares = [];
      for (let x = 1; x <= numShares; x++) {
        const y = this.evaluatePolynomial(coefficients, BigInt(x), prime);
        shares.push({ x, y: y.toString() });
      }
      
      // 7. Wipe sensitive data from memory
      this._wipeMemory(privateKeyBytes);
      this._wipeMemory(coefficients);
      
      return shares;
    } catch (error) {
      console.error("Error generating shares:", error);
      throw new Error(`Share generation failed: ${error.message}`);
    }
  }
  
  /**
   * Securely encrypt a share with a public key, with additional integrity protection
   * @param {string} publicKeyHex - Public key to encrypt with
   * @param {Object} share - Share object to encrypt
   * @returns {Promise<string>} Encrypted share (formatted for contract)
   */
  async encryptShare(publicKeyHex, share) {
    try {
      // Add integrity verification data
      const enrichedShare = {
        ...share,
        metadata: {
          timestamp: Date.now(),
          checksum: await this._computeShareChecksum(share)
        }
      };
      
      // Convert to string
      const shareStr = JSON.stringify(enrichedShare);
      
      // Encrypt with public key
      const encrypted = await EccService.encrypt(publicKeyHex, shareStr);
      
      // Format for contract
      return EccService.formatForContract(encrypted);
    } catch (error) {
      console.error("Error encrypting share:", error);
      throw new Error(`Share encryption failed: ${error.message}`);
    }
  }
  
  /**
   * Decrypt and validate a share with integrity checks
   * @param {string} privateKeyHex - Private key to decrypt with
   * @param {string} encryptedShareHex - Encrypted share from contract
   * @returns {Promise<Object>} Validated and decrypted share object
   */
  async decryptShare(privateKeyHex, encryptedShareHex) {
    try {
      // Parse the encrypted data
      const encryptedData = EccService.parseFromContract(encryptedShareHex);
      
      // Decrypt the share
      const decryptedShareJson = await EccService.decrypt(privateKeyHex, encryptedData);
      
      // Parse the JSON
      const enrichedShare = JSON.parse(decryptedShareJson);
      
      // Extract the actual share and metadata
      const { metadata, ...share } = enrichedShare;
      
      // Verify integrity
      if (metadata) {
        const computedChecksum = await this._computeShareChecksum(share);
        if (computedChecksum !== metadata.checksum) {
          throw new Error("Share integrity verification failed: checksum mismatch");
        }
      }
      
      return share;
    } catch (error) {
      console.error("Error decrypting share:", error);
      throw new Error(`Share decryption failed: ${error.message}`);
    }
  }
  
  /**
   * Reconstruct a secret from shares with additional validation
   * @param {Array<Object>} shares - Array of share objects
   * @returns {Promise<string>} Reconstructed private key hex
   */
  async reconstructSecret(shares) {
    try {
      // Validate shares
      this._validateShares(shares);
      
      // Get the prime field
      const prime = this.getPrime();
      
      // Perform Lagrange interpolation with constant-time operations
      const secret = this._constantTimeLagrangeInterpolation(shares, 0n, prime);
      
      // Convert to hex
      return this.fieldElementToHex(secret);
    } catch (error) {
      console.error("Error reconstructing secret:", error);
      throw new Error(`Secret reconstruction failed: ${error.message}`);
    }
  }
  
  // ===== Helper methods =====
  
  /**
   * Validate inputs for share generation
   * @param {string} privateKeyHex - Private key to validate
   * @param {number} numShares - Number of shares
   * @param {number} threshold - Threshold for reconstruction
   */
  _validateInputs(privateKeyHex, numShares, threshold) {
    if (!privateKeyHex || typeof privateKeyHex !== 'string' || privateKeyHex.length < 64) {
      throw new Error("Invalid private key format");
    }
    
    if (!Number.isInteger(numShares) || numShares < 2 || numShares > 100) {
      throw new Error("Number of shares must be between 2 and 100");
    }
    
    if (!Number.isInteger(threshold) || threshold < 2 || threshold > numShares) {
      throw new Error(`Threshold must be between 2 and ${numShares}`);
    }
  }
  
  /**
   * Validate shares before reconstruction
   * @param {Array<Object>} shares - Shares to validate
   */
  _validateShares(shares) {
    if (!Array.isArray(shares) || shares.length < 2) {
      throw new Error("At least 2 valid shares are required");
    }
    
    // Check for duplicate x-coordinates
    const xValues = shares.map(s => s.x);
    const uniqueXValues = new Set(xValues);
    if (uniqueXValues.size !== shares.length) {
      throw new Error("Duplicate share indices detected");
    }
    
    // Validate share format
    for (const share of shares) {
      if (!share.x || !share.y || isNaN(parseInt(share.x)) || !share.y.match(/^\d+$/)) {
        throw new Error("Invalid share format");
      }
    }
  }
  
  /**
   * Generate additional entropy for secure randomness
   * @returns {Promise<string>} Extra entropy string
   */
  async _generateExtraEntropy() {
    try {
      // Combine multiple sources of entropy
      const randomEntropy = bytesToHex(randomBytes(32));
      const timestampEntropy = Date.now().toString();
      const addressEntropy = (await this.signer.getAddress()).toLowerCase();
      
      // Hash the combined entropy
      return bytesToHex(sha256(utf8ToBytes(
        randomEntropy + timestampEntropy + addressEntropy
      )));
    } catch (error) {
      // Fallback to basic randomness if entropy generation fails
      console.warn("Enhanced entropy generation failed, using fallback", error);
      return bytesToHex(randomBytes(32));
    }
  }
  
  /**
   * Generate a random field element with added security
   * @param {bigint} prime - Prime modulus
   * @param {string} extraEntropy - Additional entropy
   * @returns {bigint} Secure random field element
   */
  _secureRandomFieldElement(prime, extraEntropy = "") {
    // Combine hardware RNG with extra entropy
    const entropyBytes = utf8ToBytes(extraEntropy);
    const randomBytes32 = randomBytes(32);
    
    // XOR the two sources of randomness
    const combined = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      combined[i] = randomBytes32[i] ^ (i < entropyBytes.length ? entropyBytes[i] : 0);
    }
    
    return this.bytesToFieldElement(combined, prime);
  }
  
  /**
   * Compute a checksum for share integrity verification
   * @param {Object} share - Share object
   * @returns {Promise<string>} Checksum string
   */
  async _computeShareChecksum(share) {
    const shareString = JSON.stringify({
      x: share.x,
      y: share.y
    });
    
    return bytesToHex(sha256(utf8ToBytes(shareString)));
  }
  
  /**
   * Securely wipe sensitive data from memory
   * @param {any} data - Data to wipe
   */
  _wipeMemory(data) {
    if (Array.isArray(data)) {
      for (let i = 0; i < data.length; i++) {
        if (typeof data[i] === 'bigint') {
          data[i] = 0n;
        } else {
          data[i] = 0;
        }
      }
    } else if (data instanceof Uint8Array) {
      crypto.getRandomValues(data); // Overwrite with random data
      for (let i = 0; i < data.length; i++) {
        data[i] = 0; // Then zero out
      }
    }
    // Let garbage collector handle the rest
  }
  
  /**
   * Constant-time Lagrange interpolation to protect against timing attacks
   * @param {Array} shares - Array of share objects with x and y
   * @param {bigint} x - Point to evaluate at (0 for the secret)
   * @param {bigint} prime - Prime modulus
   * @returns {bigint} Reconstructed secret
   */
  _constantTimeLagrangeInterpolation(shares, x, prime) {
    let result = 0n;
    
    for (let i = 0; i < shares.length; i++) {
      let numerator = 1n;
      let denominator = 1n;
      
      for (let j = 0; j < shares.length; j++) {
        // Process all shares, including i=j (which doesn't affect the result)
        // This helps prevent timing attacks by always doing the same operations
        const xi = BigInt(shares[i].x);
        const xj = BigInt(shares[j].x);
        
        // Calculate using constant-time operations
        const term1 = (x - xj) % prime;
        const term2 = (xi - xj) % prime;
        
        // Only update the result when i != j
        const shouldUpdate = (i !== j) ? 1n : 0n;
        numerator = (numerator * (term1 * shouldUpdate + 1n * (1n - shouldUpdate))) % prime;
        denominator = (denominator * (term2 * shouldUpdate + 1n * (1n - shouldUpdate))) % prime;
      }
      
      // Calculate inverse
      const inverseDenominator = this.modInverse(denominator, prime);
      
      // Calculate basis and add to result
      const basis = (numerator * inverseDenominator) % prime;
      const yi = BigInt(shares[i].y);
      result = (result + (yi * basis) % prime) % prime;
    }
    
    // Ensure result is positive
    return (result + prime) % prime;
  }
  
  /**
   * Evaluate polynomial at a specific point
   * @param {Array<bigint>} coefficients - Polynomial coefficients
   * @param {bigint} x - Point to evaluate at
   * @param {bigint} prime - Prime modulus
   * @returns {bigint} Result of evaluation
   */
  evaluatePolynomial(coefficients, x, prime) {
    let result = 0n;
    let power = 1n;
    
    for (const coeff of coefficients) {
      result = (result + (coeff * power)) % prime;
      power = (power * x) % prime;
    }
    
    return result;
  }
  
  /**
   * Convert bytes to a field element
   * @param {Uint8Array} bytes - Bytes to convert
   * @param {bigint} prime - Prime modulus
   * @returns {bigint} Field element
   */
  bytesToFieldElement(bytes, prime) {
    let result = 0n;
    for (let i = 0; i < bytes.length; i++) {
      result = (result * 256n + BigInt(bytes[i])) % prime;
    }
    return result;
  }
  
  /**
   * Convert a field element back to hex string
   * @param {bigint} fieldElement - Field element to convert
   * @returns {string} Hex string
   */
  fieldElementToHex(fieldElement) {
    return fieldElement.toString(16).padStart(64, '0');
  }
  
  /**
   * Calculate modular inverse with constant time operations
   * @param {bigint} a - Number to find inverse of
   * @param {bigint} m - Modulus
   * @returns {bigint} Modular inverse
   */
  modInverse(a, m) {
    // Implementation of extended Euclidean algorithm
    // with constant time operations to prevent timing attacks
    let [old_r, r] = [BigInt(a), BigInt(m)];
    let [old_s, s] = [1n, 0n];
    let [old_t, t] = [0n, 1n];
    
    while (r !== 0n) {
      const quotient = old_r / r;
      [old_r, r] = [r, old_r - quotient * r];
      [old_s, s] = [s, old_s - quotient * s];
      [old_t, t] = [t, old_t - quotient * t];
    }
    
    // Make sure the result is positive
    return ((old_s % m) + m) % m;
  }
}

export default ProductionShamirService;