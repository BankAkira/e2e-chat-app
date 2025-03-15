import { ethers } from 'ethers';
import { getContractAddress } from '../../constants/contractAddresses';
import SecureShareRegistryABI from '../../abis/SecureShareRegistry.json';
import SecureShareContractABI from '../../abis/SecureShareContract.json';

/**
 * Service for secure interaction with the SecureShareRegistry smart contract
 * and individual share contracts with enhanced security and error handling
 */
class SecureShareRegistryService {
  /**
   * Create a new SecureShareRegistryService instance
   * @param {ethers.Signer} signer - Ethers.js signer
   * @param {number} chainId - Chain ID for selecting contract address
   */
  constructor(signer, chainId) {
    if (!signer) {
      throw new Error("Signer is required");
    }
    
    this.signer = signer;
    this.chainId = chainId;
    
    try {
      // Get appropriate contract address for current network
      this.contractAddress = getContractAddress('SecureShareRegistry', chainId);
      if (!this.contractAddress || !ethers.isAddress(this.contractAddress)) {
        throw new Error(`Invalid contract address for network ${chainId}`);
      }
      
      // Load ABIs
      this.registryAbi = SecureShareRegistryABI.abi;
      this.shareContractAbi = SecureShareContractABI.abi;
      
      // Initialize contract instance
      this.contract = new ethers.Contract(
        this.contractAddress,
        this.registryAbi,
        signer
      );
      
      // Check if contract is deployed
      this._validateContractDeployment();
    } catch (error) {
      console.error("Error initializing SecureShareRegistryService:", error);
      throw error;
    }
  }
  
  /**
   * Store encrypted shares in separate contracts
   * @param {Array<string>} encryptedSharesHex - Array of encrypted share data (hex strings with 0x prefix)
   * @param {number} threshold - Minimum shares needed for reconstruction
   * @param {Object} options - Transaction options, including value for fee
   * @returns {Promise<{txHash: string, shareContracts: Array<string>}>} Transaction hash and created contract addresses
   */
  async storeShares(encryptedSharesHex, threshold, options = {}) {
    try {
      // Input validation
      if (!Array.isArray(encryptedSharesHex) || encryptedSharesHex.length < 3) {
        throw new Error("At least 3 encrypted shares are required");
      }
      
      if (typeof threshold !== 'number' || threshold < 2 || threshold > encryptedSharesHex.length) {
        throw new Error(`Threshold must be between 2 and ${encryptedSharesHex.length}`);
      }
      
      // Convert to bytes format for contract
      const encryptedSharesBytes = encryptedSharesHex.map(share => {
        if (!share.startsWith('0x')) {
          throw new Error("Share data must be hex string with 0x prefix");
        }
        return ethers.getBytes(share);
      });
      
      // Default options with configurable gas
      const txOptions = {
        value: ethers.parseEther("0.01"), // Default fee
        gasLimit: 9000000, // Higher gas limit for multiple contract creations
        ...options
      };
      
      console.log(`Storing ${encryptedSharesBytes.length} shares with threshold ${threshold}`);
      
      // Send transaction with retry logic
      const tx = await this._sendTransactionWithRetry(
        () => this.contract.storeShares(encryptedSharesBytes, threshold, txOptions),
        3, // max retries
        "store shares"
      );
      
      console.log(`Transaction sent with hash: ${tx.hash}`);
      
      // Wait for confirmation with timeout
      const receipt = await this._waitForTransactionWithTimeout(tx);
      console.log(`Transaction confirmed in block ${receipt.blockNumber}`);
      
      // Get created contract addresses
      const userAddress = await this.signer.getAddress();
      const shareContracts = await this.contract.getUserShareContracts(userAddress);
      
      console.log(`Successfully created ${shareContracts.length} share contracts`);
      
      // Return both transaction hash and contract addresses
      return {
        txHash: tx.hash,
        shareContracts: shareContracts
      };
    } catch (error) {
      // Enhance error information for better debugging
      const enhancedError = this._enhanceError(error, "storeShares");
      console.error("Error storing shares:", enhancedError);
      throw enhancedError;
    }
  }
  
  /**
   * Get a specific share from its contract with security verification
   * @param {string} userAddress - User's address
   * @param {number} index - Index of the share
   * @returns {Promise<string>} Encrypted share data
   */
  async getShare(userAddress, index) {
    try {
      // Input validation
      if (!ethers.isAddress(userAddress)) {
        throw new Error("Invalid user address");
      }
      
      if (typeof index !== 'number' || index < 0) {
        throw new Error("Invalid share index");
      }
      
      // Check if user has shares
      const hasShares = await this.contract.hasShares(userAddress);
      if (!hasShares) {
        throw new Error(`User ${userAddress.substring(0, 8)}... has no shares`);
      }
      
      // Get config to verify index is in range
      const config = await this.contract.getShareConfig(userAddress);
      if (index >= config.totalShares.toNumber()) {
        throw new Error(`Share index ${index} out of bounds (max: ${config.totalShares.toNumber() - 1})`);
      }
      
      // First get the share contract address
      const shareContracts = await this.contract.getUserShareContracts(userAddress);
      const shareContractAddress = shareContracts[index];
      
      // Verify the share contract exists
      if (!shareContractAddress || !ethers.isAddress(shareContractAddress)) {
        throw new Error(`Invalid share contract address for index ${index}`);
      }
      
      // Create contract instance for the specific share
      const shareContract = new ethers.Contract(
        shareContractAddress,
        this.shareContractAbi,
        this.signer
      );
      
      // Verify active status before attempting retrieval
      const isActive = await shareContract.isActive();
      if (!isActive) {
        throw new Error(`Share at index ${index} is inactive`);
      }
      
      // Check authorization before wasting gas on a failing transaction
      const currentAddress = await this.signer.getAddress();
      if (currentAddress !== userAddress) {
        const isAuthorized = await shareContract.isAuthorized(currentAddress);
        if (!isAuthorized) {
          throw new Error("Not authorized to access this share");
        }
      }
      
      // Get the share data with retry logic for network issues
      const encryptedShare = await this._sendTransactionWithRetry(
        () => shareContract.getShare(),
        2, // max retries
        "get share"
      );
      
      return ethers.hexlify(encryptedShare);
    } catch (error) {
      const enhancedError = this._enhanceError(error, "getShare");
      console.error(`Error retrieving share at index ${index}:`, enhancedError);
      throw enhancedError;
    }
  }
  
  /**
   * Get multiple shares by their indices with parallel processing and error handling
   * @param {string} userAddress - User's address
   * @param {Array<number>} indices - Array of share indices
   * @returns {Promise<Array<{index: number, data: string}>>} Array of shares with their indices
   */
  async getMultipleShares(userAddress, indices) {
    if (!Array.isArray(indices) || indices.length === 0) {
      throw new Error("Invalid indices array");
    }
    
    // Verify the user has shares before processing
    const hasShares = await this.contract.hasShares(userAddress);
    if (!hasShares) {
      throw new Error(`User ${userAddress.substring(0, 8)}... has no shares`);
    }
    
    // Process share retrievals in parallel with individual error handling
    const retrievalPromises = indices.map(async (index) => {
      try {
        const shareData = await this.getShare(userAddress, index);
        return { index, data: shareData, success: true };
      } catch (error) {
        console.warn(`Failed to retrieve share at index ${index}:`, error);
        return { index, error: error.message, success: false };
      }
    });
    
    // Wait for all retrievals to complete
    const results = await Promise.all(retrievalPromises);
    
    // Filter successful retrievals
    const successfulRetrievals = results.filter(result => result.success);
    
    // Check if we have enough shares
    if (successfulRetrievals.length === 0) {
      const errorMessages = results.map(r => `${r.index}: ${r.error}`).join('; ');
      throw new Error(`Failed to retrieve any shares. Errors: ${errorMessages}`);
    }
    
    return successfulRetrievals.map(result => ({
      index: result.index,
      data: result.data
    }));
  }
  
  /**
   * Add a recovery address with security verification
   * @param {string} recoveryAddress - Address to add as recovery
   * @returns {Promise<{txHash: string}>} Transaction hash
   */
  async addRecoveryAddress(recoveryAddress) {
    try {
      // Validate address format
      if (!ethers.isAddress(recoveryAddress)) {
        throw new Error("Invalid Ethereum address format");
      }
      
      // Check if already a recovery address to avoid wasting gas
      const isAlreadyRecovery = await this.isRecoveryAddress(
        await this.signer.getAddress(),
        recoveryAddress
      );
      
      if (isAlreadyRecovery) {
        throw new Error(`${recoveryAddress.substring(0, 8)}... is already a recovery address`);
      }
      
      // Send transaction with retry
      const tx = await this._sendTransactionWithRetry(
        () => this.contract.addRecoveryAddress(recoveryAddress),
        2,
        "add recovery address"
      );
      
      const receipt = await this._waitForTransactionWithTimeout(tx);
      
      return { txHash: tx.hash };
    } catch (error) {
      const enhancedError = this._enhanceError(error, "addRecoveryAddress");
      console.error("Error adding recovery address:", enhancedError);
      throw enhancedError;
    }
  }
  
  /**
   * Remove a recovery address
   * @param {string} recoveryAddress - Address to remove
   * @returns {Promise<{txHash: string}>} Transaction hash
   */
  async removeRecoveryAddress(recoveryAddress) {
    try {
      // Validate address format
      if (!ethers.isAddress(recoveryAddress)) {
        throw new Error("Invalid Ethereum address format");
      }
      
      // Check if actually a recovery address
      const isRecovery = await this.isRecoveryAddress(
        await this.signer.getAddress(),
        recoveryAddress
      );
      
      if (!isRecovery) {
        throw new Error(`${recoveryAddress.substring(0, 8)}... is not a recovery address`);
      }
      
      // Send transaction with retry
      const tx = await this._sendTransactionWithRetry(
        () => this.contract.removeRecoveryAddress(recoveryAddress),
        2,
        "remove recovery address"
      );
      
      const receipt = await this._waitForTransactionWithTimeout(tx);
      
      return { txHash: tx.hash };
    } catch (error) {
      const enhancedError = this._enhanceError(error, "removeRecoveryAddress");
      console.error("Error removing recovery address:", enhancedError);
      throw enhancedError;
    }
  }
  
  /**
   * Set emergency contact
   * @param {string} contactAddress - Emergency contact address
   * @returns {Promise<{txHash: string}>} Transaction hash
   */
  async setEmergencyContact(contactAddress) {
    try {
      // Validate address format
      if (!ethers.isAddress(contactAddress)) {
        throw new Error("Invalid Ethereum address format");
      }
      
      // Verify not setting self as contact
      const selfAddress = await this.signer.getAddress();
      if (contactAddress.toLowerCase() === selfAddress.toLowerCase()) {
        throw new Error("Cannot set yourself as emergency contact");
      }
      
      // Send transaction with retry
      const tx = await this._sendTransactionWithRetry(
        () => this.contract.setEmergencyContact(contactAddress),
        2,
        "set emergency contact"
      );
      
      const receipt = await this._waitForTransactionWithTimeout(tx);
      
      return { txHash: tx.hash };
    } catch (error) {
      const enhancedError = this._enhanceError(error, "setEmergencyContact");
      console.error("Error setting emergency contact:", enhancedError);
      throw enhancedError;
    }
  }
  
  /**
   * Initiate emergency recovery for a user
   * @param {string} userAddress - Address to recover
   * @returns {Promise<{txHash: string, expiresAt: number}>} Transaction hash and expiration timestamp
   */
  async initiateRecovery(userAddress) {
    try {
      // Validate address format
      if (!ethers.isAddress(userAddress)) {
        throw new Error("Invalid Ethereum address format");
      }
      
      // Check if user has shares
      const hasShares = await this.contract.hasShares(userAddress);
      if (!hasShares) {
        throw new Error(`User ${userAddress.substring(0, 8)}... has no shares`);
      }
      
      // Check authorization
      const selfAddress = await this.signer.getAddress();
      const isEmergencyContact = 
        (await this.contract.getEmergencyContact(userAddress)).toLowerCase() === 
        selfAddress.toLowerCase();
      
      const isRecoveryAddress = await this.isRecoveryAddress(userAddress, selfAddress);
      
      if (!isEmergencyContact && !isRecoveryAddress) {
        throw new Error("Not authorized to initiate recovery");
      }
      
      // Check if recovery already initiated
      const recoveryRequest = await this.contract.recoveryRequests(userAddress);
      if (recoveryRequest.isActive) {
        throw new Error("Recovery already initiated");
      }
      
      // Send transaction with retry
      const tx = await this._sendTransactionWithRetry(
        () => this.contract.initiateRecovery(userAddress),
        2,
        "initiate recovery"
      );
      
      await this._waitForTransactionWithTimeout(tx);
      
      // Get updated recovery data
      const updatedRecovery = await this.contract.recoveryRequests(userAddress);
      
      return { 
        txHash: tx.hash,
        expiresAt: updatedRecovery.expiresAt.toNumber()
      };
    } catch (error) {
      const enhancedError = this._enhanceError(error, "initiateRecovery");
      console.error("Error initiating recovery:", enhancedError);
      throw enhancedError;
    }
  }
  
  /**
   * Cancel a recovery request
   * @param {string} userAddress - Address for which to cancel recovery
   * @returns {Promise<{txHash: string}>} Transaction hash
   */
  async cancelRecovery(userAddress) {
    try {
      // Validate address format
      if (!ethers.isAddress(userAddress)) {
        throw new Error("Invalid Ethereum address format");
      }
      
      // Check if recovery is active
      const recoveryRequest = await this.contract.recoveryRequests(userAddress);
      if (!recoveryRequest.isActive) {
        throw new Error("No active recovery request");
      }
      
      // Send transaction with retry
      const tx = await this._sendTransactionWithRetry(
        () => this.contract.cancelRecovery(userAddress),
        2,
        "cancel recovery"
      );
      
      await this._waitForTransactionWithTimeout(tx);
      
      return { txHash: tx.hash };
    } catch (error) {
      const enhancedError = this._enhanceError(error, "cancelRecovery");
      console.error("Error canceling recovery:", enhancedError);
      throw enhancedError;
    }
  }
  
  /**
   * Revoke all shares
   * @returns {Promise<{txHash: string}>} Transaction hash
   */
  async revokeShares() {
    try {
      // Check if user has shares
      const userAddress = await this.signer.getAddress();
      const hasShares = await this.contract.hasShares(userAddress);
      if (!hasShares) {
        throw new Error("No shares to revoke");
      }
      
      // Send transaction with retry
      const tx = await this._sendTransactionWithRetry(
        () => this.contract.revokeShares(),
        2,
        "revoke shares"
      );
      
      await this._waitForTransactionWithTimeout(tx);
      
      return { txHash: tx.hash };
    } catch (error) {
      const enhancedError = this._enhanceError(error, "revokeShares");
      console.error("Error revoking shares:", enhancedError);
      throw enhancedError;
    }
  }
  
  /**
   * Check if an address is a recovery address for a user
   * @param {string} userAddress - User's address
   * @param {string} recoveryAddress - Recovery address to check
   * @returns {Promise<boolean>} True if authorized
   */
  async isRecoveryAddress(userAddress, recoveryAddress) {
    try {
      return await this.contract.isRecoveryAddress(userAddress, recoveryAddress);
    } catch (error) {
      console.error("Error checking recovery address:", error);
      return false;
    }
  }
  
  /**
   * Check if a user has shares stored
   * @param {string} userAddress - User's address
   * @returns {Promise<boolean>} True if user has shares
   */
  async hasShares(userAddress) {
    try {
      return await this.contract.hasShares(userAddress);
    } catch (error) {
      console.error("Error checking shares:", error);
      return false;
    }
  }
  
  /**
   * Get share configuration for a user
   * @param {string} userAddress - User's address
   * @returns {Promise<Object>} Share configuration
   */
  async getShareConfig(userAddress) {
    try {
      const config = await this.contract.getShareConfig(userAddress);
      
      return {
        totalShares: config.totalShares.toNumber(),
        threshold: config.threshold.toNumber(),
        creationTime: config.creationTime.toNumber(),
        isActive: config.isActive,
        configHash: config.configHash
      };
    } catch (error) {
      const enhancedError = this._enhanceError(error, "getShareConfig");
      console.error("Error getting share config:", enhancedError);
      throw enhancedError;
    }
  }
  
  /**
   * Get all share contract addresses for a user
   * @param {string} userAddress - User's address
   * @returns {Promise<Array<string>>} Array of contract addresses
   */
  async getShareContracts(userAddress) {
    try {
      return await this.contract.getUserShareContracts(userAddress);
    } catch (error) {
      const enhancedError = this._enhanceError(error, "getShareContracts");
      console.error("Error getting share contracts:", enhancedError);
      throw enhancedError;
    }
  }
  
  /**
   * Get all recovery addresses for a user
   * @param {string} userAddress - User's address
   * @returns {Promise<Array<string>>} Array of recovery addresses
   */
  async getRecoveryAddresses(userAddress) {
    try {
      return await this.contract.getUserRecoveryAddresses(userAddress);
    } catch (error) {
      const enhancedError = this._enhanceError(error, "getRecoveryAddresses");
      console.error("Error getting recovery addresses:", enhancedError);
      throw enhancedError;
    }
  }
  
  /**
   * Get active recovery request for a user
   * @param {string} userAddress - User's address
   * @returns {Promise<Object|null>} Recovery request details or null if none exists
   */
  async getRecoveryRequest(userAddress) {
    try {
      const request = await this.contract.recoveryRequests(userAddress);
      
      if (!request.isActive) {
        return null;
      }
      
      return {
        initiator: request.initiator,
        requestTime: request.requestTime.toNumber(),
        expiresAt: request.expiresAt.toNumber(),
        requestHash: request.requestHash,
        isActive: request.isActive,
        remaining: Math.max(0, request.expiresAt.toNumber() - Math.floor(Date.now() / 1000))
      };
    } catch (error) {
      const enhancedError = this._enhanceError(error, "getRecoveryRequest");
      console.error("Error getting recovery request:", enhancedError);
      throw enhancedError;
    }
  }
  
  // ===== Private Helper Methods =====
  
  /**
   * Validate that the contract is deployed
   * @private
   */
  async _validateContractDeployment() {
    try {
      // Try to call a view function to check deployment
      await this.contract.VERSION();
    } catch (error) {
      throw new Error(`Contract not deployed at ${this.contractAddress} on network ${this.chainId}`);
    }
  }
  
  /**
   * Send a transaction with automatic retry on common errors
   * @param {Function} txFunction - Function that returns a transaction promise
   * @param {number} maxRetries - Maximum number of retries
   * @param {string} operation - Name of operation for logging
   * @private
   */
  async _sendTransactionWithRetry(txFunction, maxRetries, operation) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      try {
        // If not first attempt, add delay with exponential backoff
        if (attempt > 1) {
          const delay = Math.min(2000 * Math.pow(2, attempt - 2), 10000);
          console.log(`Retrying ${operation} (attempt ${attempt}/${maxRetries + 1}) after ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
        
        return await txFunction();
      } catch (error) {
        lastError = error;
        
        // Only retry on certain errors
        const shouldRetry = 
          error.code === 'NETWORK_ERROR' || 
          error.code === 'TIMEOUT' ||
          error.code === 'SERVER_ERROR' ||
          error.message.includes('nonce') ||
          error.message.includes('underpriced') ||
          error.message.includes('replacement fee too low');
        
        if (!shouldRetry || attempt > maxRetries) {
          break;
        }
        
        console.warn(`Transaction attempt ${attempt} failed:`, error.message);
      }
    }
    
    throw lastError;
  }
  
  /**
   * Wait for transaction with timeout
   * @param {ethers.ContractTransaction} tx - Transaction to wait for
   * @param {number} timeoutMs - Timeout in milliseconds
   * @private
   */
  async _waitForTransactionWithTimeout(tx, timeoutMs = 180000) {
    try {
      // Create a promise that rejects after the timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Transaction confirmation timed out after ${timeoutMs/1000} seconds`));
        }, timeoutMs);
      });
      
      // Race between confirmation and timeout
      return await Promise.race([
        tx.wait(),
        timeoutPromise
      ]);
    } catch (error) {
      // Check if transaction was actually confirmed despite timeout
      try {
        const provider = this.signer.provider;
        const receipt = await provider.getTransactionReceipt(tx.hash);
        
        if (receipt && receipt.blockNumber) {
          console.warn("Transaction was confirmed despite timeout");
          return receipt;
        }
      } catch (innerError) {
        console.error("Error checking receipt after timeout:", innerError);
      }
      
      throw error;
    }
  }
  
  /**
   * Enhance error information for better debugging
   * @param {Error} error - Original error
   * @param {string} operation - Name of operation where error occurred
   * @private
   */
  _enhanceError(error, operation) {
    const enhancedError = new Error(`Error in ${operation}: ${error.message}`);
    enhancedError.originalError = error;
    enhancedError.code = error.code;
    enhancedError.operation = operation;
    
    // Add user-friendly message
    if (error.code === 'INSUFFICIENT_FUNDS') {
      enhancedError.userMessage = "You don't have enough funds to complete this transaction.";
    } else if (error.code === 'UNPREDICTABLE_GAS_LIMIT') {
      enhancedError.userMessage = "The transaction cannot be processed. It might be failing on the contract.";
    } else if (error.message.includes('user rejected')) {
      enhancedError.userMessage = "Transaction was cancelled.";
    } else if (error.message.includes('blacklisted')) {
      enhancedError.userMessage = "This address has been blacklisted by the contract administrator.";
    } else if (error.message.includes('throttle')) {
      enhancedError.userMessage = "Too many requests. Please wait a few minutes and try again.";
    } else {
      enhancedError.userMessage = "An error occurred while processing your request. Please try again later.";
    }
    
    return enhancedError;
  }
}

export default SecureShareRegistryService;