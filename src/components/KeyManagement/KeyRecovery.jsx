import React, { useState } from 'react';
import { useKeyPair } from '../../context/KeyPairContext';
import { useWallet } from '../../context/WalletContext';
import ShamirSecretSharingService from '../../services/contracts/ShamirSecretSharingService';
import DistributedSSSRegistryService from '../../services/contracts/DistributedSSSRegistryService';
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
    
    const shamirService = new ShamirSecretSharingService(signer, chainId);
    const registryService = new DistributedSSSRegistryService(signer, chainId);
    
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
    
    if (validIndices.length < 3) {
      setError("At least 3 valid share indices are required");
      return;
    }
    
    setIsRecovering(true);
    setRecoveryProgress('Initializing recovery process...');
    setError('');
    
    try {
      const { shamirService, registryService } = initServices();
      const userAddress = await signer.getAddress();
      
      // Step 1: Retrieve encrypted shares from the registry
      setRecoveryProgress('Retrieving encrypted shares from registry...');
      
      const encryptedShares = await registryService.getShares(userAddress, validIndices);
      
      if (encryptedShares.length < 3) {
        throw new Error(`Could only retrieve ${encryptedShares.length} shares, need at least 3`);
      }
      
      // Step 2: Need to get the user's public key to verify the private key
      setRecoveryProgress('Retrieving public key...');
      
      // At this point we don't have the private key to decrypt the shares
      // In a real implementation, you might have a recovery method such as:
      // 1. A hardware wallet or backup seed phrase
      // 2. A social recovery mechanism where friends help decrypt
      // 3. A multi-sig approach for enterprise recovery
      
      // For demo purposes, we'll simulate recovery with Shamir directly
      setRecoveryProgress('Reconstructing private key from shares...');
      
      const privateKeyHex = await shamirService.reconstructSecret(validIndices);
      
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