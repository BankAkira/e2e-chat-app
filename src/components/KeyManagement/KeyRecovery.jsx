import React, { useState } from 'react';
import { useKeyPair } from '../../context/KeyPairContext';
import { useWallet } from '../../context/WalletContext';
import ProductionShamirService from '../../services/contracts/ProductionShamirService';
import SecureShareRegistryService from '../../services/contracts/SecureShareRegistryService';
import EccService from '../../services/cryptography/EccService';

const KeyRecovery = () => {
  const { importKeyPair } = useKeyPair();
  const { signer, chainId } = useWallet();
  
  const [showRecovery, setShowRecovery] = useState(false);
  const [isRecovering, setIsRecovering] = useState(false);
  const [recoveryProgress, setRecoveryProgress] = useState('');
  const [error, setError] = useState('');
  const [recoveryShareIndices, setRecoveryShareIndices] = useState(['', '', '']);
  const [recoveredKey, setRecoveredKey] = useState(null);
  
  // Initialize services when needed
  const initServices = () => {
    if (!signer) return { shamirService: null, registryService: null };
    
    const shamirService = new ProductionShamirService(signer, chainId);
    const registryService = new SecureShareRegistryService(signer, chainId);
    
    return { shamirService, registryService };
  };
  
  const handleIndexChange = (index, value) => {
    const newIndices = [...recoveryShareIndices];
    newIndices[index] = value;
    setRecoveryShareIndices(newIndices);
  };
  
  const addShareInput = () => {
    setRecoveryShareIndices([...recoveryShareIndices, '']);
  };
  
  const handleRecoverKey = async () => {
    if (!signer) {
      setError("Wallet must be connected for recovery");
      return;
    }
    
    // Filter out empty indices
    const validIndices = recoveryShareIndices
      .filter(index => index.trim() !== '')
      .map(index => parseInt(index.trim()));
    
    if (validIndices.length < THRESHOLD) {
      setError(`At least ${THRESHOLD} valid share indices are required`);
      return;
    }
    
    setIsRecovering(true);
    setRecoveryProgress('Initializing recovery process...');
    setError('');
    
    try {
      const { registryService } = initServices();
      const userAddress = await signer.getAddress();
      
      // Step 1: Retrieve encrypted shares from the registry
      setRecoveryProgress('Retrieving encrypted shares from registry...');
      
      const encryptedShares = await registryService.getShares(userAddress, validIndices);
      
      if (encryptedShares.length < THRESHOLD) {
        throw new Error(`Could only retrieve ${encryptedShares.length} shares, need at least ${THRESHOLD}`);
      }
      
      // Step 2: Decrypt shares using recovery mechanism
      // This depends on your recovery approach (social recovery, hardware device, etc.)
      setRecoveryProgress('Decrypting shares...');
      
      // For demo purposes, we'll assume you have a way to decrypt
      // In a real implementation, this would use the recovery mechanism
      const decryptedShares = [];
      
      for (const encryptedShare of encryptedShares) {
        // Parse the encrypted data
        const encryptedData = EccService.parseFromContract(encryptedShare);
        
        // Decrypt share using recovery key
        // NOTE: This part depends on your recovery mechanism
        const decryptedShare = await EccService.decrypt(recoveryKey, encryptedData);
        
        // For demo purposes only
        // const decryptedShare = "demo_decrypted_share"; // Replace with actual decryption
        
        decryptedShares.push(decryptedShare);
      }
      
      // Step 3: Combine shares to reconstruct the secret
      setRecoveryProgress('Reconstructing private key from shares...');
      
      // Combine shares using the secrets.js library
      const privateKeyHex = secrets.combine(decryptedShares);
      
      // Verify the key by deriving the public key
      const recoveredKeyPair = EccService.importFromPrivateKey(privateKeyHex);
      
      setRecoveredKey(recoveredKeyPair);
      setRecoveryProgress('Key recovered successfully!');
      
      // Import the recovered key pair
      importKeyPair(privateKeyHex);
    } catch (error) {
      console.error("Error during recovery process:", error);
      setError(`Recovery failed: ${error.message}`);
    } finally {
      setIsRecovering(false);
    }
  };
  
  const toggleRecovery = () => {
    setShowRecovery(!showRecovery);
    setError('');
    setRecoveryProgress('');
  };
  
  return (
    <div className="bg-gray-100 p-4 rounded-lg mb-6">
      <div className="flex justify-between items-center mb-2">
        <h2 className="text-lg font-semibold">Key Recovery</h2>
        <button 
          className="text-blue-600 underline text-sm"
          onClick={toggleRecovery}
        >
          {showRecovery ? 'Hide Recovery' : 'Recover Private Key'}
        </button>
      </div>
      
      {!showRecovery ? (
        <p className="text-sm text-gray-600">
          Lost your private key? You can recover it using the Shamir shares stored in the registry.
        </p>
      ) : (
        <div className="mt-2">
          <p className="mb-3 text-sm">
            Enter the indices of at least 3 shares to recover your private key:
          </p>
          
          <div className="space-y-2 mb-4">
            {recoveryShareIndices.map((shareIndex, idx) => (
              <input
                key={idx}
                type="number"
                value={shareIndex}
                onChange={(e) => handleIndexChange(idx, e.target.value)}
                placeholder={`Share Index ${idx + 1}`}
                className="border rounded p-2 w-full"
              />
            ))}
            
            {recoveryShareIndices.length < 5 && (
              <button 
                className="text-blue-500 text-sm"
                onClick={addShareInput}
              >
                + Add Another Share Index
              </button>
            )}
          </div>
          
          <button 
            className="bg-blue-500 text-white px-4 py-2 rounded"
            onClick={handleRecoverKey}
            disabled={isRecovering}
          >
            {isRecovering ? 'Recovering...' : 'Recover Key'}
          </button>
          
          {recoveryProgress && (
            <div className="mt-3 p-2 bg-blue-50 border border-blue-200 rounded">
              <p className="text-sm">{recoveryProgress}</p>
            </div>
          )}
          
          {error && (
            <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded">
              <p className="text-sm text-red-500">{error}</p>
            </div>
          )}
          
          {recoveredKey && (
            <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded">
              <h3 className="font-semibold text-sm mb-2">Key Successfully Recovered!</h3>
              <p className="text-xs">
                Private Key: {recoveredKey.privateKey.substring(0, 10)}...
              </p>
              <p className="text-xs">
                Public Key: {recoveredKey.publicKey.substring(0, 10)}...
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default KeyRecovery;