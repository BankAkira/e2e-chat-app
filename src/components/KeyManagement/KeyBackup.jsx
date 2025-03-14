import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { useKeyPair } from '../../context/KeyPairContext';
import { useWallet } from '../../context/WalletContext';
import ShamirSecretSharingService from '../../services/contracts/ShamirSecretSharingService';
import DistributedSSSRegistryService from '../../services/contracts/DistributedSSSRegistryService';
import EccService from '../../services/cryptography/EccService';

const KeyBackup = () => {
  const { keyPair, isKeyRegistered, isBackedUp, setIsBackedUp } = useKeyPair();
  const { signer, chainId } = useWallet();
  
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [backupProgress, setBackupProgress] = useState('');
  const [sharesGenerated, setSharesGenerated] = useState(false);
  const [shareData, setShareData] = useState([]);
  const [error, setError] = useState('');
  
  // Backup configuration
  const NUM_SHARES = 5;
  const THRESHOLD = 3;
  
  // Initialize services when needed
  const initServices = () => {
    if (!signer) return { shamirService: null, registryService: null };
    
    const shamirService = new ShamirSecretSharingService(signer, chainId);
    const registryService = new DistributedSSSRegistryService(signer, chainId);
    
    return { shamirService, registryService };
  };
  
  // Check if backup already exists
  useEffect(() => {
    const checkBackupStatus = async () => {
      if (isKeyRegistered && signer) {
        try {
          const { registryService } = initServices();
          const address = await signer.getAddress();
          const hasShares = await registryService.hasShares(address);
          setIsBackedUp(hasShares);
        } catch (error) {
          console.error("Error checking backup status:", error);
        }
      }
    };
    
    checkBackupStatus();
  }, [isKeyRegistered, signer, setIsBackedUp]);
  
  const handleBackupKey = async () => {
    if (!keyPair || !isKeyRegistered || !signer) {
      setError("Key must be registered before backup");
      return;
    }
    
    setIsBackingUp(true);
    setBackupProgress('Initializing backup process...');
    setError('');
    
    try {
      const { shamirService, registryService } = initServices();
      
      // Step 1: Generate Shamir shares for the private key
      setBackupProgress('Generating Shamir secret shares...');
      
      // Convert private key to bytes format
      const privateKeyBytes = keyPair.privateKey;
      
      // Split the secret using the Shamir contract
      const shareIndices = await shamirService.splitSecretWithHybridRandomness(
        privateKeyBytes,
        NUM_SHARES,
        THRESHOLD
      );
      
      setBackupProgress('Retrieving generated shares...');
      
      // Get all shares from the contract
      const shares = [];
      for (let i = 1; i <= NUM_SHARES; i++) {
        const share = await shamirService.getShare(i);
        shares.push(share);
      }
      
      setShareData(shares);
      setSharesGenerated(true);
      
      // Step 2: Encrypt shares with public key
      setBackupProgress('Encrypting shares with public key...');
      
      const encryptedShares = await Promise.all(
        shares.map(async (share) => {
          // Convert share data to string then encrypt it
          const shareStr = JSON.stringify(share);
          const encrypted = await EccService.encrypt(keyPair.publicKey, shareStr);
          
          // Format for contract
          return EccService.formatForContract(encrypted);
        })
      );
      
      // Step 3: Store encrypted shares in distributed registry
      setBackupProgress('Storing encrypted shares in distributed registry...');
      
      // Store shares using the registry
      await registryService.storeShares(
        encryptedShares,
        THRESHOLD,
        { value: ethers.utils.parseEther("0.01") } // Service fee
      );
      
      setBackupProgress('Backup completed successfully!');
      setIsBackedUp(true);
    } catch (error) {
      console.error("Error during backup process:", error);
      setError(`Backup failed: ${error.message}`);
    } finally {
      setIsBackingUp(false);
    }
  };
  
  if (!isKeyRegistered) {
    return (
      <div className="bg-gray-100 p-4 rounded-lg mb-6">
        <h2 className="text-lg font-semibold mb-2">Private Key Backup</h2>
        <p className="text-gray-500">
          Register your key on the blockchain first to enable backup functionality.
        </p>
      </div>
    );
  }
  
  if (isBackedUp) {
    return (
      <div className="bg-gray-100 p-4 rounded-lg mb-6">
        <h2 className="text-lg font-semibold mb-2">Private Key Backup</h2>
        <div className="bg-green-100 p-3 rounded border border-green-300">
          <p className="text-green-700">
            ✓ Your private key is securely backed up using Shamir's Secret Sharing.
          </p>
          <p className="text-sm mt-2">
            To recover your key, you'll need at least {THRESHOLD} out of {NUM_SHARES} shares.
          </p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="bg-gray-100 p-4 rounded-lg mb-6">
      <h2 className="text-lg font-semibold mb-2">Private Key Backup</h2>
      
      <p className="mb-3">
        Backup your private key using Shamir's Secret Sharing. Your key will be split into {NUM_SHARES} shares,
        and you'll need at least {THRESHOLD} shares to recover it.
      </p>
      
      {!sharesGenerated ? (
        <button 
          className="bg-green-500 text-white px-4 py-2 rounded"
          onClick={handleBackupKey}
          disabled={isBackingUp}
        >
          {isBackingUp ? 'Processing...' : 'Backup Private Key'}
        </button>
      ) : (
        <div className="mt-4">
          <h3 className="font-semibold mb-2">Generated Shares:</h3>
          <div className="bg-white p-2 rounded border mb-3 max-h-40 overflow-y-auto">
            {shareData.map((share, index) => (
              <div key={index} className="mb-2 text-xs font-mono">
                <span className="font-semibold">Share {index + 1}:</span>
                <br />
                x: {share.x}
                <br />
                y: {share.y.substring(0, 10)}...
              </div>
            ))}
          </div>
          
          <p className="text-sm mb-3">
            These shares are being encrypted and stored in the distributed registry.
          </p>
        </div>
      )}
      
      {backupProgress && (
        <div className="mt-3 p-2 bg-blue-50 border border-blue-200 rounded">
          <p className="text-sm">{backupProgress}</p>
        </div>
      )}
      
      {error && (
        <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded">
          <p className="text-sm text-red-500">{error}</p>
        </div>
      )}
    </div>
  );
};

export default KeyBackup;