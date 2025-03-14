import { ethers } from 'ethers';
import { getContractAddress } from '../../constants/contractAddresses';
import ShamirSecretSharingABI from '../../abis/ShamirSecretSharing.json';

/**
 * Service for interacting with the ShamirSecretSharing smart contract
 */
class ShamirSecretSharingService {
  /**
   * Create a new ShamirSecretSharingService instance
   * @param {ethers.Signer} signer - Ethers.js signer
   * @param {number} chainId - Chain ID for selecting contract address
   */
  constructor(signer, chainId) {
    if (!signer) {
      throw new Error("Signer is required");
    }
    
    const abi = ShamirSecretSharingABI.abi;
    this.contract = new ethers.Contract(
    this.contractAddress,
    abi,
    signer
    );

  }
  
  /**
   * Commit to polynomial coefficients before using them
   * @param {Array<string>} coefficients - Array of polynomial coefficients
   * @returns {Promise<string>} Commitment ID
   */
  async commitToCoefficients(coefficients) {
    // Convert to proper format
    const coeffsAsNumbers = coefficients.map(c => 
        ethers.getBigInt(c)
    );
    
    // Hash coefficients
    const coefficientsHash = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(['uint256[]'], [coeffsAsNumbers])
    );
    
    // Send transaction
    const tx = await this.contract.commitToCoefficients(coefficientsHash);
    const receipt = await tx.wait();
    
    // Extract commitment ID from transaction
    const event = receipt.events.find(e => e.event === 'CoefficientCommitted');
    return event.args.commitmentId;
  }
  
  /**
   * Split a secret into shares using client-provided coefficients
   * @param {string} secretHex - Secret to split (hex string without 0x prefix)
   * @param {number} numShares - Number of shares to generate
   * @param {number} threshold - Minimum shares needed for reconstruction
   * @param {Array<string>} clientCoefficients - Client-provided polynomial coefficients
   * @param {string} commitmentId - Commitment ID from prior call to commitToCoefficients
   * @returns {Promise<Array<number>>} Array of share indices (x coordinates)
   */
  async splitSecretWithClientCoefficients(
    secretHex,
    numShares,
    threshold,
    clientCoefficients,
    commitmentId
  ) {
    // Convert secret to bytes
    const secretBytes = ethers.getBytes('0x' + secretHex);
    
    // Send transaction
    const tx = await this.contract.splitSecretWithClientCoefficients(
      secretBytes,
      numShares,
      threshold,
      clientCoefficients,
      commitmentId
    );
    
    const receipt = await tx.wait();
    
    // Extract share indices from event
    const event = receipt.events.find(e => e.event === 'SharesGenerated');
    
    // Parse result from transaction
    const result = await this.contract.callStatic.splitSecretWithClientCoefficients(
      secretBytes,
      numShares,
      threshold,
      clientCoefficients,
      commitmentId
    );
    
    // Convert to numbers
    return result.map(x => x.toNumber());
  }
  
  /**
   * Split a secret into shares using hybrid randomness
   * @param {string} secretHex - Secret to split (hex string without 0x prefix)
   * @param {number} numShares - Number of shares to generate
   * @param {number} threshold - Minimum shares needed for reconstruction
   * @returns {Promise<Array<number>>} Array of share indices (x coordinates)
   */
  async splitSecretWithHybridRandomness(secretHex, numShares, threshold) {
    // Convert secret to bytes
    const secretBytes = ethers.getBytes('0x' + secretHex);
    
    // Generate client seed for additional randomness
    const clientSeed = ethers.utils.randomBytes(32);
    
    // Send transaction
    const tx = await this.contract.splitSecretWithHybridRandomness(
      secretBytes,
      numShares,
      threshold,
      clientSeed
    );
    
    const receipt = await tx.wait();
    
    // Parse result from transaction
    const result = await this.contract.callStatic.splitSecretWithHybridRandomness(
      secretBytes,
      numShares,
      threshold,
      clientSeed
    );
    
    // Convert to numbers
    return result.map(x => x.toNumber());
  }
  
  /**
   * Reconstruct a secret from shares
   * @param {Array<number>} shareIndices - Array of share indices to use
   * @returns {Promise<string>} Reconstructed secret as hex string
   */
  async reconstructSecret(shareIndices) {
    // Send transaction
    const result = await this.contract.callStatic.reconstructSecret(shareIndices);
    
    // Convert result to hex string
    return ethers.hexlify(result).substring(2); // Remove '0x' prefix
  }
  
  /**
   * Get a specific share by index
   * @param {number} index - Share index
   * @returns {Promise<Object>} Share object with x and y values
   */
  async getShare(index) {
    const result = await this.contract.getShare(index);
    
    return {
      x: result.x.toNumber(),
      y: result.y.toString() // Keep as string for large numbers
    };
  }
  
  /**
   * Get user's share configuration
   * @returns {Promise<Object>} Object with totalShares and threshold
   */
  async getShareConfig() {
    const result = await this.contract.getShareConfig();
    
    return {
      totalShares: result.totalShares.toNumber(),
      threshold: result.threshold.toNumber()
    };
  }
  
  /**
   * Check if a user has shares
   * @returns {Promise<boolean>} True if the user has shares
   */
  async hasShares() {
    try {
      const config = await this.getShareConfig();
      return config.totalShares > 0;
    } catch (error) {
      return false;
    }
  }
  
  /**
   * Evaluate a polynomial at a specific point
   * @param {Array<string>} coefficients - Array of polynomial coefficients
   * @param {number} x - The x-coordinate at which to evaluate the polynomial
   * @returns {Promise<string>} The y-coordinate as a string
   */
  async evaluatePolynomial(coefficients, x) {
    const coeffsAsNumbers = coefficients.map(c => 
        ethers.getBigInt(c)
    );
    
    const result = await this.contract.callStatic.evaluatePolynomial(coeffsAsNumbers, x);
    return result.toString();
  }
  
  /**
   * Calculate modular inverse
   * @param {string} a - Number to find inverse of
   * @param {string} m - Modulus
   * @returns {Promise<string>} Modular inverse as string
   */
  async modInverse(a, m) {
    const result = await this.contract.callStatic.modInverse(
        ethers.getBigInt(a),
        ethers.getBigInt(m)
    );
    return result.toString();
  }
  
  /**
   * Convert bytes to uint256
   * @param {string} dataHex - Data in hex format
   * @returns {Promise<string>} Converted value as string
   */
  async bytesToUint(dataHex) {
    const dataBytes = ethers.getBytes('0x' + dataHex);
    const result = await this.contract.callStatic.bytesToUint(dataBytes);
    return result.toString();
  }
  
  /**
   * Convert uint256 to bytes
   * @param {string} value - Value to convert
   * @returns {Promise<string>} Converted value as hex string
   */
  async uintToBytes(value) {
    const result = await this.contract.callStatic.uintToBytes(
        ethers.getBigInt(value)
    );
    return ethers.hexlify(result).substring(2); // Remove '0x' prefix
  }
}

export default ShamirSecretSharingService;