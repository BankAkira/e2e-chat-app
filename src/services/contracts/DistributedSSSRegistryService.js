import { ethers } from 'ethers';
import { getContractAddress } from '../../constants/contractAddresses';
import DistributedSSSRegistryABI from '../../abis/DistributedSSSRegistry.json';

/**
 * Service for interacting with the DistributedSSSRegistry smart contract
 */
class DistributedSSSRegistryService {
  /**
   * Create a new DistributedSSSRegistryService instance
   * @param {ethers.Signer} signer - Ethers.js signer
   * @param {number} chainId - Chain ID for selecting contract address
   */
  constructor(signer, chainId) {
    if (!signer) {
      throw new Error("Signer is required");
    }
    
    this.signer = signer;
    this.contractAddress = getContractAddress('DistributedSSSRegistry', chainId);
    this.contract = new ethers.Contract(
      this.contractAddress,
      DistributedSSSRegistryABI,
      signer
    );
  }
  
  /**
   * Store encrypted shares in separate contracts
   * @param {Array<string>} encryptedSharesHex - Array of encrypted share data (hex strings with 0x prefix)
   * @param {number} threshold - Minimum shares needed for reconstruction
   * @param {Object} options - Transaction options, including value for fee
   * @returns {Promise<Array<string>>} Array of created contract addresses
   */
  async storeShares(encryptedSharesHex, threshold, options = {}) {
    // Convert to bytes format for contract
    const encryptedSharesBytes = encryptedSharesHex.map(share => 
      ethers.utils.arrayify(share)
    );
    
    // Default options
    const txOptions = {
      value: ethers.utils.parseEther("0.01"), // Default fee
      ...options
    };
    
    // Send transaction
    const tx = await this.contract.storeShares(
      encryptedSharesBytes,
      threshold,
      txOptions
    );
    
    const receipt = await tx.wait();
    
    // Extract contract addresses from event
    const event = receipt.events.find(e => e.event === 'SharesStored');
    
    // Parse result from transaction
    const result = await this.contract.callStatic.storeShares(
      encryptedSharesBytes,
      threshold,
      txOptions
    );
    
    return result;
  }
  
  /**
   * Add a recovery address
   * @param {string} recoveryAddress - Address to add as recovery
   * @returns {Promise<ethers.ContractTransaction>} Transaction
   */
  async addRecoveryAddress(recoveryAddress) {
    const tx = await this.contract.addRecoveryAddress(recoveryAddress);
    await tx.wait();
    return tx;
  }
  
  /**
   * Remove a recovery address
   * @param {string} recoveryAddress - Address to remove
   * @returns {Promise<ethers.ContractTransaction>} Transaction
   */
  async removeRecoveryAddress(recoveryAddress) {
    const tx = await this.contract.removeRecoveryAddress(recoveryAddress);
    await tx.wait();
    return tx;
  }
  
  /**
   * Check if an address is authorized as a recovery address for a user
   * @param {string} userAddress - User's address
   * @param {string} recoveryAddress - Recovery address to check
   * @returns {Promise<boolean>} True if authorized
   */
  async isRecoveryAddress(userAddress, recoveryAddress) {
    return await this.contract.isRecoveryAddress(userAddress, recoveryAddress);
  }
  
  /**
   * Get the number of recovery addresses for a user
   * @param {string} userAddress - User's address
   * @returns {Promise<number>} Recovery address count
   */
  async getRecoveryAddressCount(userAddress) {
    const count = await this.contract.getRecoveryAddressCount(userAddress);
    return count.toNumber();
  }
  
  /**
   * Revoke all shares
   * @returns {Promise<ethers.ContractTransaction>} Transaction
   */
  async revokeShares() {
    const tx = await this.contract.revokeShares();
    await tx.wait();
    return tx;
  }
  
  /**
   * Check if a user has shares stored
   * @param {string} userAddress - User's address
   * @returns {Promise<boolean>} True if user has shares
   */
  async hasShares(userAddress) {
    return await this.contract.hasShares(userAddress);
  }
  
  /**
   * Get share configuration for a user
   * @param {string} userAddress - User's address
   * @returns {Promise<Object>} Share configuration
   */
  async getShareConfig(userAddress) {
    const config = await this.contract.getShareConfig(userAddress);
    
    return {
      totalShares: config.totalShares.toNumber(),
      threshold: config.threshold.toNumber(),
      creationTime: config.creationTime.toNumber(),
      isActive: config.isActive
    };
  }
  
  /**
   * Get shares for an authorized user
   * @param {string} userAddress - User address who owns the shares
   * @param {Array<number>} indices - Array of share indices to retrieve
   * @returns {Promise<Array<string>>} Array of encrypted shares
   */
  async getShares(userAddress, indices) {
    // Verify current user is authorized
    const shares = [];
    
    for (let index of indices) {
      try {
        const shareData = await this.contract.getShare(userAddress, index);
        shares.push(ethers.utils.hexlify(shareData));
      } catch (error) {
        console.error(`Error retrieving share at index ${index}:`, error);
      }
    }
    
    return shares;
  }
  
  /**
   * Store shares for another user (meta-transaction)
   * @param {string} userAddress - User to store shares for
   * @param {Array<string>} encryptedSharesHex - Array of encrypted share data
   * @param {number} threshold - Minimum shares needed for reconstruction
   * @param {number} deadline - Transaction deadline timestamp
   * @param {Object} signature - ECDSA signature object with v, r, s components
   * @param {Object} options - Transaction options
   * @returns {Promise<Array<string>>} Array of created contract addresses
   */
  async storeSharesFor(
    userAddress,
    encryptedSharesHex,
    threshold,
    deadline,
    signature,
    options = {}
  ) {
    // Convert to bytes format for contract
    const encryptedSharesBytes = encryptedSharesHex.map(share => 
      ethers.utils.arrayify(share)
    );
    
    // Default options
    const txOptions = {
      value: ethers.utils.parseEther("0.01"), // Default fee
      ...options
    };
    
    // Send transaction
    const tx = await this.contract.storeSharesFor(
      userAddress,
      encryptedSharesBytes,
      threshold,
      deadline,
      signature.v,
      signature.r,
      signature.s,
      txOptions
    );
    
    const receipt = await tx.wait();
    
    // Parse result from transaction
    const result = await this.contract.callStatic.storeSharesFor(
      userAddress,
      encryptedSharesBytes,
      threshold,
      deadline,
      signature.v,
      signature.r,
      signature.s,
      txOptions
    );
    
    return result;
  }
}

export default DistributedSSSRegistryService;