import React, { createContext, useState, useEffect, useContext } from 'react';
import { ethers } from 'ethers';

// Create context
const WalletContext = createContext(null);

// Custom hook to use the wallet context
export const useWallet = () => {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
};

// Provider component
export const WalletProvider = ({ children }) => {
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [account, setAccount] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [chainId, setChainId] = useState(null);

  // Connect wallet function
  const connectWallet = async () => {
    try {
      if (window.ethereum) {
        // Request account access
        await window.ethereum.request({ method: 'eth_requestAccounts' });
        
        // Create ethers provider
        const ethersProvider = new ethers.providers.Web3Provider(window.ethereum);
        setProvider(ethersProvider);
        
        // Get signer
        const ethersSigner = ethersProvider.getSigner();
        setSigner(ethersSigner);
        
        // Get connected account
        const address = await ethersSigner.getAddress();
        setAccount(address);
        
        // Get network information
        const network = await ethersProvider.getNetwork();
        setChainId(network.chainId);
        
        setIsConnected(true);
        
        return true;
      } else {
        console.error("Ethereum provider not found");
        return false;
      }
    } catch (error) {
      console.error("Error connecting wallet:", error);
      return false;
    }
  };

  // Disconnect wallet function
  const disconnectWallet = () => {
    setProvider(null);
    setSigner(null);
    setAccount('');
    setIsConnected(false);
    setChainId(null);
  };

  // Listen for account changes
  useEffect(() => {
    if (window.ethereum) {
      const handleAccountsChanged = (accounts) => {
        if (accounts.length === 0) {
          // User disconnected their wallet
          disconnectWallet();
        } else if (accounts[0] !== account) {
          // User switched accounts
          setAccount(accounts[0]);
        }
      };

      const handleChainChanged = (chainIdHex) => {
        // Convert hex chainId to decimal
        const newChainId = parseInt(chainIdHex, 16);
        setChainId(newChainId);
        
        // Refresh provider and signer on chain change
        const ethersProvider = new ethers.providers.Web3Provider(window.ethereum);
        setProvider(ethersProvider);
        setSigner(ethersProvider.getSigner());
      };

      // Subscribe to events
      window.ethereum.on('accountsChanged', handleAccountsChanged);
      window.ethereum.on('chainChanged', handleChainChanged);

      // Check if already connected
      window.ethereum.request({ method: 'eth_accounts' })
        .then(accounts => {
          if (accounts.length > 0) {
            connectWallet();
          }
        })
        .catch(console.error);

      // Cleanup event listeners
      return () => {
        window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
        window.ethereum.removeListener('chainChanged', handleChainChanged);
      };
    }
  }, [account]);

  // Create value object
  const value = {
    provider,
    signer,
    account,
    isConnected,
    chainId,
    connectWallet,
    disconnectWallet
  };

  // Return provider
  return (
    <WalletContext.Provider value={value}>
      {children}
    </WalletContext.Provider>
  );
};

export default WalletContext;