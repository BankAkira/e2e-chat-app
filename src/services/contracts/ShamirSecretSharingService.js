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
    
    try {
      // Ensure chainId is a number and provide a default
      chainId = Number(chainId || 1);
      
      // Correctly set the contract address using getContractAddress
      this.contractAddress = getContractAddress('ShamirSecretSharing', chainId);
      
      // Validate contract address
      if (!this.contractAddress || !ethers.isAddress(this.contractAddress)) {
        throw new Error(`Invalid contract address for network ${chainId}`);
      }
      
      const abi = ShamirSecretSharingABI.abi;
      
      // Validate ABI
      if (!abi || abi.length === 0) {
        throw new Error('Invalid or empty ABI');
      }
      
      // Create contract instance
      this.contract = new ethers.Contract(
        this.contractAddress,
        abi,
        signer
      );
      
      // Validate contract instance
      if (!this.contract) {
        throw new Error('Failed to create contract instance');
      }
      
      // Log contract details for debugging
      console.log('Shamir Secret Sharing Contract Details:', {
        address: this.contractAddress,
        network: chainId,
        methodCount: abi.filter(item => item.type === 'function').length
      });
    } catch (error) {
      console.error('Error initializing ShamirSecretSharingService:', error);
      throw error;
    }
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
   * Split a secret into shares using hybrid randomness
   * @param {string} secretHex - Secret to split (hex string without 0x prefix)
   * @param {number} numShares - Number of shares to generate
   * @param {number} threshold - Minimum shares needed for reconstruction
   * @returns {Promise<Array<number>>} Array of share indices (x coordinates)
   */
  async splitSecretWithHybridRandomness(secretHex, numShares, threshold) {
    try {
      // Validate inputs
      if (!this.contract) {
        throw new Error('Contract not initialized');
      }
      
      if (!secretHex) {
        throw new Error('Secret is required');
      }
      
      if (numShares < 2 || threshold < 1 || threshold > numShares) {
        throw new Error('Invalid shares or threshold configuration');
      }
      
      // Convert secret to bytes
      const secretBytes = ethers.getBytes('0x' + secretHex);
      
      // Generate client seed for additional randomness
      const clientSeed = ethers.randomBytes(32);
      
      // Validate contract method exists
      if (typeof this.contract.splitSecretWithHybridRandomness !== 'function') {
        throw new Error('splitSecretWithHybridRandomness method not found in contract');
      }
      
      // Simulate the call first to catch any potential errors
      const staticResult = await this.contract.callStatic.splitSecretWithHybridRandomness(
        secretBytes,
        numShares,
        threshold,
        clientSeed
      );
      
      // Send actual transaction
      const tx = await this.contract.splitSecretWithHybridRandomness(
        secretBytes,
        numShares,
        threshold,
        clientSeed
      );
      
      const receipt = await tx.wait();
      
      // Convert to numbers
      return staticResult.map(x => x.toNumber());
    } catch (error) {
      console.error('Error in splitSecretWithHybridRandomness:', error);
      
      // Provide more context about the error
      if (error.code === 'CALL_EXCEPTION') {
        console.error('Contract call failed. Possible reasons:');
        console.error('- Incorrect contract address');
        console.error('- Contract not deployed on current network');
        console.error('- Method not present in contract');
      }
      
      throw error;
    }
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
    const clientSeed = ethers.randomBytes(32);
    
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