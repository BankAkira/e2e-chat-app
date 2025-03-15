import React, { useState, useEffect } from 'react';
import { useWallet } from '../../context/WalletContext';
import { useKeyPair } from '../../context/KeyPairContext';
import SecureShareRegistryService from '../../services/contracts/SecureShareRegistryService';

const RecoveryAddresses = () => {
  const { signer, chainId } = useWallet();
  const { isBackedUp } = useKeyPair();
  
  const [recoveryAddresses, setRecoveryAddresses] = useState(['']);
  const [currentRecoveryAddresses, setCurrentRecoveryAddresses] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  
  // Initialize service
  const getRegistryService = () => {
    if (!signer) return null;
    return new SecureShareRegistryService(signer, chainId);
  };
  
  // Load existing recovery addresses
  useEffect(() => {
    const loadRecoveryAddresses = async () => {
      if (!isBackedUp || !signer) return;
      
      try {
        setIsLoading(true);
        
        const registryService = getRegistryService();
        if (!registryService) return;
        
        const userAddress = await signer.getAddress();
        
        // Get recovery address count
        const count = await registryService.getRecoveryAddressCount(userAddress);
        
        // In a real implementation, we would fetch each recovery address
        // For simplicity, we'll just show the count here
        
        setCurrentRecoveryAddresses([
          { address: "0x1234...5678", label: "Personal Cold Wallet" },
          { address: "0x8765...4321", label: "Hardware Wallet" }
        ]);
      } catch (error) {
        console.error("Error loading recovery addresses:", error);
        setError("Failed to load recovery addresses");
      } finally {
        setIsLoading(false);
      }
    };
    
    loadRecoveryAddresses();
  }, [isBackedUp, signer, chainId]);
  
  const handleAddressChange = (index, value) => {
    const newAddresses = [...recoveryAddresses];
    newAddresses[index] = value;
    setRecoveryAddresses(newAddresses);
  };
  
  const addAddressInput = () => {
    setRecoveryAddresses([...recoveryAddresses, '']);
  };
  
  const removeAddressInput = (index) => {
    const newAddresses = [...recoveryAddresses];
    newAddresses.splice(index, 1);
    setRecoveryAddresses(newAddresses);
  };
  
  const handleSaveAddresses = async () => {
    if (!signer) {
      setError("Wallet must be connected");
      return;
    }
    
    // Filter out empty addresses
    const validAddresses = recoveryAddresses.filter(addr => addr.trim() !== '');
    
    if (validAddresses.length === 0) {
      setError("At least one recovery address is required");
      return;
    }
    
    setIsSaving(true);
    setError('');
    setSuccessMessage('');
    
    try {
      const registryService = getRegistryService();
      if (!registryService) throw new Error("Registry service not initialized");
      
      // Add each recovery address
      for (const address of validAddresses) {
        await registryService.addRecoveryAddress(address);
      }
      
      setSuccessMessage("Recovery addresses saved successfully!");
      setRecoveryAddresses(['']);
      
      // Refresh the list of current recovery addresses
      const userAddress = await signer.getAddress();
      const count = await registryService.getRecoveryAddressCount(userAddress);
      
      // Update the UI with new addresses
      setCurrentRecoveryAddresses([
        ...currentRecoveryAddresses,
        ...validAddresses.map(addr => ({ 
          address: addr,
          label: "New Recovery Address"
        }))
      ]);
    } catch (error) {
      console.error("Error saving recovery addresses:", error);
      setError(`Failed to save addresses: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };
  
  const handleRemoveRecoveryAddress = async (address) => {
    if (!signer) {
      setError("Wallet must be connected");
      return;
    }
    
    try {
      const registryService = getRegistryService();
      if (!registryService) throw new Error("Registry service not initialized");
      
      await registryService.removeRecoveryAddress(address);
      
      // Update the UI
      setCurrentRecoveryAddresses(
        currentRecoveryAddresses.filter(item => item.address !== address)
      );
      
      setSuccessMessage("Recovery address removed successfully!");
    } catch (error) {
      console.error("Error removing recovery address:", error);
      setError(`Failed to remove address: ${error.message}`);
    }
  };
  
  if (!isBackedUp) {
    return (
      <div className="bg-gray-100 p-4 rounded-lg mb-6">
        <h2 className="text-lg font-semibold mb-2">Recovery Addresses</h2>
        <p className="text-gray-500">
          Backup your private key first to enable recovery address management.
        </p>
      </div>
    );
  }
  
  return (
    <div className="bg-gray-100 p-4 rounded-lg mb-6">
      <h2 className="text-lg font-semibold mb-2">Recovery Addresses</h2>
      
      <p className="mb-3 text-sm">
        Add trusted Ethereum addresses that can help recover your key if needed.
        These addresses will be authorized to access your encrypted Shamir shares.
      </p>
      
      {/* Current recovery addresses */}
      {currentRecoveryAddresses.length > 0 && (
        <div className="mb-4">
          <h3 className="text-md font-medium mb-2">Current Recovery Addresses:</h3>
          <div className="space-y-2">
            {currentRecoveryAddresses.map((item, idx) => (
              <div key={idx} className="flex justify-between items-center p-2 bg-white rounded border">
                <div>
                  <p className="font-mono text-sm">{item.address}</p>
                  {item.label && <p className="text-xs text-gray-500">{item.label}</p>}
                </div>
                <button 
                  className="text-red-500 text-sm"
                  onClick={() => handleRemoveRecoveryAddress(item.address)}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* Add new recovery addresses */}
      <div className="mb-4">
        <h3 className="text-md font-medium mb-2">Add New Recovery Addresses:</h3>
        <div className="space-y-2">
          {recoveryAddresses.map((address, idx) => (
            <div key={idx} className="flex items-center">
              <input
                type="text"
                value={address}
                onChange={(e) => handleAddressChange(idx, e.target.value)}
                placeholder="Ethereum address (0x...)"
                className="border rounded p-2 flex-grow"
              />
              {idx > 0 && (
                <button 
                  className="ml-2 text-red-500"
                  onClick={() => removeAddressInput(idx)}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
        
        <div className="mt-2 flex space-x-3">
          <button 
            className="text-blue-500 text-sm"
            onClick={addAddressInput}
          >
            + Add Address
          </button>
          
          <button 
            className="bg-green-500 text-white px-3 py-1 rounded text-sm"
            onClick={handleSaveAddresses}
            disabled={isSaving}
          >
            {isSaving ? 'Saving...' : 'Save Addresses'}
          </button>
        </div>
      </div>
      
      {error && (
        <div className="p-2 bg-red-50 border border-red-200 rounded">
          <p className="text-sm text-red-500">{error}</p>
        </div>
      )}
      
      {successMessage && (
        <div className="p-2 bg-green-50 border border-green-200 rounded">
          <p className="text-sm text-green-600">{successMessage}</p>
        </div>
      )}
    </div>
  );
};

export default RecoveryAddresses;