import React, { createContext, useState, useContext, useEffect } from 'react';
import { useWallet } from './WalletContext';
import EccService from '../services/cryptography/EccService';
import ECCOperationsService from '../services/contracts/ECCOperationsService';

// Create context
const KeyPairContext = createContext(null);

// Custom hook to use the key pair context
export const useKeyPair = () => {
  const context = useContext(KeyPairContext);
  if (!context) {
    throw new Error('useKeyPair must be used within a KeyPairProvider');
  }
  return context;
};

// Provider component
export const KeyPairProvider = ({ children }) => {
  const { signer, account, isConnected } = useWallet();
  
  const [keyPair, setKeyPair] = useState(null);
  const [isKeyRegistered, setIsKeyRegistered] = useState(false);
  const [isBackedUp, setIsBackedUp] = useState(false);
  const [eccContract, setEccContract] = useState(null);
  const [publicKeys, setPublicKeys] = useState({});
  
  // Initialize services when wallet is connected
  useEffect(() => {
    const initializeServices = async () => {
      if (isConnected && signer) {
        // Initialize ECC contract service
        const eccService = new ECCOperationsService(signer);
        setEccContract(eccService);
        
        // Check if user already has a registered key
        try {
          const hasKey = await eccService.hasPublicKey(account);
          setIsKeyRegistered(hasKey);
          
          if (hasKey) {
            // Fetch public key
            const publicKeyHex = await eccService.getPublicKeyHex(account);
            
            // Store in public keys cache
            setPublicKeys(prev => ({
              ...prev,
              [account]: publicKeyHex
            }));
            
            console.log("Public key loaded from contract");
          }
        } catch (error) {
          console.error("Error checking public key:", error);
        }
      }
    };
    
    initializeServices();
  }, [isConnected, signer, account]);
  
  // Generate a new ECC key pair
  const generateKeyPair = async () => {
    try {
      // Use ECC service to generate a key pair
      const newKeyPair = await EccService.generateKeyPair();
      setKeyPair(newKeyPair);
      
      // Add public key to cache
      setPublicKeys(prev => ({
        ...prev,
        [account]: newKeyPair.publicKey
      }));
      
      console.log("New key pair generated");
      
      return newKeyPair;
    } catch (error) {
      console.error("Error generating key pair:", error);
      throw error;
    }
  };
  
  // Register public key on the blockchain
  const registerPublicKey = async () => {
    if (!eccContract || !keyPair) {
      throw new Error("Contract not initialized or no key pair");
    }
    
    try {
      // Register through service
      await eccContract.registerPublicKey(keyPair.publicKey);
      
      setIsKeyRegistered(true);
      console.log("Public key registered on blockchain");
      
      return true;
    } catch (error) {
      console.error("Error registering public key:", error);
      throw error;
    }
  };
  
  // Import key pair (for recovery)
  const importKeyPair = (privateKeyHex) => {
    try {
      // Use ECC service to import key from private key
      const importedKeyPair = EccService.importFromPrivateKey(privateKeyHex);
      setKeyPair(importedKeyPair);
      
      // Add to public keys cache
      setPublicKeys(prev => ({
        ...prev,
        [account]: importedKeyPair.publicKey
      }));
      
      return importedKeyPair;
    } catch (error) {
      console.error("Error importing key pair:", error);
      throw error;
    }
  };
  
  // Get contact's public key
  const getContactPublicKey = async (contactAddress) => {
    if (!eccContract) return null;
    
    // Check if we already have it cached
    if (publicKeys[contactAddress]) {
      return publicKeys[contactAddress];
    }
    
    try {
      // Fetch through service
      const publicKeyHex = await eccContract.getPublicKeyHex(contactAddress);
      
      // Update cache
      setPublicKeys(prev => ({
        ...prev,
        [contactAddress]: publicKeyHex
      }));
      
      return publicKeyHex;
    } catch (error) {
      console.error("Error fetching contact public key:", error);
      return null;
    }
  };
  
  // Create value object
  const value = {
    keyPair,
    isKeyRegistered,
    isBackedUp,
    setIsBackedUp,
    publicKeys,
    generateKeyPair,
    registerPublicKey,
    importKeyPair,
    getContactPublicKey
  };
  
  // Return provider
  return (
    <KeyPairContext.Provider value={value}>
      {children}
    </KeyPairContext.Provider>
  );
};

export default KeyPairContext;