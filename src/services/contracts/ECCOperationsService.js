import { ethers } from 'ethers';
import { getContractAddress } from '../../constants/contractAddresses';
import ECCOperationsABI from '../../abis/ECCOperations.json';
import EccService from '../cryptography/EccService';

/**
 * Service for interacting with the ECCOperations smart contract
 */
class ECCOperationsService {
  /**
   * Create a new ECCOperationsService instance
   * @param {ethers.Signer} signer - Ethers.js signer
   * @param {number} chainId - Chain ID for selecting contract address
   */
  constructor(signer, chainId) {
    if (!signer) {
      throw new Error("Signer is required");
    }
    
    this.signer = signer;
    this.contractAddress = getContractAddress('ECCOperations', chainId);
    this.contract = new ethers.Contract(
      this.contractAddress,
      ECCOperationsABI,
      signer
    );
  }
  
  /**
   * Check if an address has a registered public key
   * @param {string} address - Ethereum address to check
   * @returns {Promise<boolean>} True if address has a registered key
   */
  async hasPublicKey(address) {
    return await this.contract.hasPublicKey(address);
  }
  
  /**
   * Get a user's public key
   * @param {string} address - Ethereum address
   * @returns {Promise<Uint8Array>} Public key bytes
   */
  async getPublicKey(address) {
    const publicKeyBytes = await this.contract.getPublicKey(address);
    return publicKeyBytes;
  }
  
  /**
   * Get a user's public key as hex string
   * @param {string} address - Ethereum address
   * @returns {Promise<string>} Public key as hex string (without 0x prefix)
   */
  async getPublicKeyHex(address) {
    const publicKeyBytes = await this.getPublicKey(address);
    const publicKeyHex = ethers.utils.hexlify(publicKeyBytes);
    
    // Remove '0x' prefix and the '04' byte if present (for uncompressed keys)
    const hexString = publicKeyHex.substring(2);
    return hexString.startsWith('04') ? hexString.substring(2) : hexString;
  }
  
  /**
   * Register a public key
   * @param {string} publicKeyHex - Public key in hex format (without 0x prefix)
   * @returns {Promise<ethers.ContractTransaction>} Transaction
   */
  async registerPublicKey(publicKeyHex) {
    // Make sure publicKey is properly formatted with '04' prefix for uncompressed keys
    const formattedPublicKey = publicKeyHex.startsWith('04') 
      ? publicKeyHex 
      : '04' + publicKeyHex;
    
    // Convert to bytes format for contract
    const publicKeyBytes = ethers.utils.arrayify('0x' + formattedPublicKey);
    
    // Send transaction
    const tx = await this.contract.registerPublicKey(publicKeyBytes);
    
    // Wait for confirmation
    await tx.wait();
    
    return tx;
  }
  
  /**
   * Register a public key on behalf of another user (meta-transaction)
   * @param {string} userAddress - Address to register key for
   * @param {string} publicKeyHex - Public key in hex format
   * @param {number} deadline - Transaction deadline timestamp
   * @param {Object} signature - ECDSA signature object with v, r, s components
   * @returns {Promise<ethers.ContractTransaction>} Transaction
   */
  async registerPublicKeyFor(userAddress, publicKeyHex, deadline, signature) {
    // Make sure publicKey is properly formatted with '04' prefix for uncompressed keys
    const formattedPublicKey = publicKeyHex.startsWith('04') 
      ? publicKeyHex 
      : '04' + publicKeyHex;
    
    const publicKeyBytes = ethers.utils.arrayify('0x' + formattedPublicKey);
    
    const tx = await this.contract.registerPublicKeyFor(
      userAddress,
      publicKeyBytes,
      deadline,
      signature.v,
      signature.r,
      signature.s
    );
    
    await tx.wait();
    
    return tx;
  }
  
  /**
   * Revoke a public key
   * @returns {Promise<ethers.ContractTransaction>} Transaction
   */
  async revokePublicKey() {
    const tx = await this.contract.revokePublicKey();
    await tx.wait();
    return tx;
  }
  
  /**
   * Compute a shared key with a recipient
   * @param {string} recipientAddress - Recipient's Ethereum address
   * @param {string} ephemeralKeyHex - Ephemeral key in hex format
   * @returns {Promise<string>} Key ID
   */
  async computeSharedKey(recipientAddress, ephemeralKeyHex) {
    // Make sure ephemeralKey is properly formatted
    const formattedEphemeralKey = ephemeralKeyHex.startsWith('04') 
      ? ephemeralKeyHex 
      : '04' + ephemeralKeyHex;
    
    const ephemeralKeyBytes = ethers.utils.arrayify('0x' + formattedEphemeralKey);
    
    const tx = await this.contract.computeSharedKey(recipientAddress, ephemeralKeyBytes);
    const receipt = await tx.wait();
    
    // Extract key ID from event
    const event = receipt.events.find(e => e.event === 'SharedKeyComputed');
    return event.args.keyId;
  }
  
  /**
   * Get the current nonce for a user's meta-transactions
   * @param {string} userAddress - User's Ethereum address
   * @returns {Promise<number>} Current nonce
   */
  async getNonce(userAddress) {
    const nonce = await this.contract.getNonce(userAddress);
    return nonce.toNumber();
  }
  
  /**
   * Create a signature for meta-transactions
   * @param {string} privateKeyHex - Private key in hex format
   * @param {Object} data - Data to sign
   * @param {number} deadline - Transaction deadline timestamp
   * @returns {Promise<Object>} Signature object with v, r, s components
   */
  async createSignature(privateKeyHex, data, deadline) {
    // Get the domain separator from the contract
    const domainSeparator = await this.contract.getDomainSeparator();
    
    // Get the current nonce
    const wallet = new ethers.Wallet(privateKeyHex);
    const nonce = await this.getNonce(wallet.address);
    
    // Create the hash of the function data
    const functionDataHash = ethers.utils.keccak256(
      ethers.utils.defaultAbiCoder.encode(
        ['bytes32', 'address', 'bytes', 'uint256'],
        [
          ethers.utils.id('registerPublicKeyFor(address user,bytes publicKey,uint256 deadline)'),
          data.userAddress,
          data.publicKeyBytes,
          deadline
        ]
      )
    );
    
    // Create the digest to sign
    const digest = ethers.utils.keccak256(
      ethers.utils.solidityPack(
        ['bytes1', 'bytes1', 'bytes32', 'bytes32'],
        [
          '0x19',
          '0x01',
          domainSeparator,
          ethers.utils.keccak256(
            ethers.utils.defaultAbiCoder.encode(
              ['bytes32', 'uint256'],
              [functionDataHash, nonce]
            )
          )
        ]
      )
    );
    
    // Sign the digest
    const signingKey = new ethers.utils.SigningKey(privateKeyHex);
    const signature = signingKey.signDigest(digest);
    
    return {
      v: signature.v,
      r: signature.r,
      s: signature.s
    };
  }
}

export default ECCOperationsService;