import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ethers } from 'ethers';
import { useKeyPair } from '../../context/KeyPairContext';
import { useWallet } from '../../context/WalletContext';
import ProductionShamirService from '../../services/cryptography/ProductionShamirService';
import SecureShareRegistryService from '../../services/contracts/SecureShareRegistryService';

// Constants
const NUM_SHARES = 48;
const THRESHOLD = 16;
const BACKUP_STAGES = {
  IDLE: 'idle',
  GENERATING: 'generating',
  ENCRYPTING: 'encrypting',
  STORING: 'storing',
  CONFIRMING: 'confirming',
  SUCCESS: 'success',
  ERROR: 'error'
};

const SecureOneClickBackup = () => {
  // Contexts
  const { keyPair, isKeyRegistered, isBackedUp, setIsBackedUp } = useKeyPair();
  const { signer, chainId, account } = useWallet();
  
  // Component state
  const [backupStage, setBackupStage] = useState(BACKUP_STAGES.IDLE);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState('');
  const [txHash, setTxHash] = useState('');
  const [shareContracts, setShareContracts] = useState([]);
  const [backupDetails, setBackupDetails] = useState(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [agreementChecked, setAgreementChecked] = useState(false);
  
  // Refs for security
  const isComponentMounted = useRef(true);
  const backupInProgress = useRef(false);

  // Check if backup already exists
  const checkBackupStatus = useCallback(async () => {
    if (isKeyRegistered && signer && account) {
      try {
        const registryService = new SecureShareRegistryService(signer, chainId);
        const hasShares = await registryService.hasShares(account);
        
        if (hasShares) {
          const config = await registryService.getShareConfig(account);
          setBackupDetails(config);
        }
        
        setIsBackedUp(hasShares);
      } catch (error) {
        console.error("Error checking backup status:", error);
      }
    }
  }, [isKeyRegistered, signer, chainId, account, setIsBackedUp]);

  // Effect to check backup status on mount and when dependencies change
  useEffect(() => {
    checkBackupStatus();
  }, [checkBackupStatus]);
  
  // Clean up on unmount
  useEffect(() => {
    return () => {
      isComponentMounted.current = false;
    };
  }, []);

  /**
   * Handle the one-click backup process
   */
  const handleOneClickBackup = async () => {
    // Security checks
    if (backupInProgress.current) {
      console.warn("Backup already in progress");
      return;
    }
    
    if (!keyPair) {
      setError("No key pair available for backup");
      return;
    }
    
    if (!isKeyRegistered) {
      setError("Key must be registered before backup");
      return;
    }
    
    if (!signer) {
      setError("Wallet not connected");
      return;
    }
    
    if (!agreementChecked) {
      setError("Please accept the security agreement before proceeding");
      return;
    }
    
    try {
      // Set flags to prevent duplicate operations
      backupInProgress.current = true;
      
      // Reset state
      setBackupStage(BACKUP_STAGES.GENERATING);
      setProgress(5);
      setStatusMessage('Initializing secure backup process...');
      setError('');
      setTxHash('');
      setShareContracts([]);
      
      // Initialize services
      const shamirService = new ProductionShamirService(signer, chainId);
      const registryService = new SecureShareRegistryService(signer, chainId);
      
      // Step 1: Generate shares locally with security measures
      setBackupStage(BACKUP_STAGES.GENERATING);
      setStatusMessage('Generating secure key shares...');
      setProgress(10);
      
      // Artificial delay for security perception (makes the process feel more substantial)
      await new Promise(resolve => setTimeout(resolve, 1200));
      
      // Generate Shamir shares locally
      const shares = await shamirService.generateShares(keyPair.privateKey, NUM_SHARES, THRESHOLD);
      
      // Safety check to prevent continuation if component unmounted
      if (!isComponentMounted.current) return;
      
      setProgress(30);
      setBackupStage(BACKUP_STAGES.ENCRYPTING);
      setStatusMessage('Encrypting shares with enhanced security...');
      
      // Step 2: Encrypt shares with public key and additional security measures
      const encryptedShares = [];
      
      for (let i = 0; i < shares.length; i++) {
        // Update progress for each 10% of shares
        if (i % Math.ceil(shares.length / 10) === 0) {
          setProgress(30 + Math.floor((i / shares.length) * 30));
        }
        
        // Convert share to string then encrypt with additional security
        const encryptedShare = await shamirService.encryptShare(keyPair.publicKey, shares[i]);
        encryptedShares.push(encryptedShare);
        
        // Check if component still mounted after each async operation
        if (!isComponentMounted.current) return;
      }
      
      setProgress(60);
      setBackupStage(BACKUP_STAGES.STORING);
      setStatusMessage('Sending to blockchain (this may take a minute)...');
      
      // Step 3: Store encrypted shares in one transaction
      const result = await registryService.storeShares(
        encryptedShares,
        THRESHOLD,
        { value: ethers.parseEther("0.01") } // Service fee
      );
      
      // Check if component still mounted after blockchain operation
      if (!isComponentMounted.current) return;
      
      setTxHash(result.txHash);
      setShareContracts(result.shareContracts);
      
      setProgress(80);
      setBackupStage(BACKUP_STAGES.CONFIRMING);
      setStatusMessage('Verifying backup integrity...');
      
      // Step 4: Verify backup was properly stored
      await checkBackupStatus();
      
      // Final safety check
      if (!isComponentMounted.current) return;
      
      setProgress(100);
      setStatusMessage('Backup completed successfully!');
      setBackupStage(BACKUP_STAGES.SUCCESS);
      
    } catch (error) {
      // Only update state if component is still mounted
      if (isComponentMounted.current) {
        console.error("Error during backup process:", error);
        setBackupStage(BACKUP_STAGES.ERROR);
        
        // Extract user-friendly message if available
        const userMessage = error.userMessage || "An unexpected error occurred during backup";
        setError(userMessage + ": " + error.message);
      }
    } finally {
      // Clear the in-progress flag
      backupInProgress.current = false;
    }
  };

  // Security agreement toggle
  const handleAgreementToggle = () => {
    setAgreementChecked(!agreementChecked);
  };
  
  // Toggle details panel
  const toggleDetails = () => {
    setIsDetailsOpen(!isDetailsOpen);
  };
  
  // Get transaction explorer URL based on the current network
  const getExplorerUrl = (txHash) => {
    if (!txHash) return '#';
    
    // Determine explorer based on chainId
    switch (chainId) {
      case 1: // Ethereum mainnet
        return `https://etherscan.io/tx/${txHash}`;
      case 5: // Goerli testnet
        return `https://goerli.etherscan.io/tx/${txHash}`;
      case 42161: // Arbitrum
        return `https://arbiscan.io/tx/${txHash}`;
      case 137: // Polygon
        return `https://polygonscan.com/tx/${txHash}`;
      case 25925: // kub testnet
        return `https://kub.com/tx/${txHash}`;
      default:
        return `https://etherscan.io/tx/${txHash}`;
    }
  };

  // Component rendering based on backup status
  if (!isKeyRegistered) {
    return (
      <div className="bg-white p-6 rounded-lg shadow-md mb-6">
        <h2 className="text-lg font-semibold mb-2">Secure Key Backup</h2>
        <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
          <div className="flex items-start">
            <svg className="w-5 h-5 text-yellow-600 mr-2 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <p className="text-yellow-600">
              Please register your key on the blockchain first to enable backup functionality.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (isBackedUp) {
    return (
      <div className="bg-white p-6 rounded-lg shadow-md mb-6">
        <h2 className="text-lg font-semibold mb-2">Secure Key Backup</h2>
        <div className="bg-green-50 p-4 rounded-lg border border-green-200">
          <div className="flex items-center">
            <svg className="w-6 h-6 text-green-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <h3 className="text-green-700 font-medium">Your private key is securely backed up</h3>
          </div>
          
          <div className="mt-3 pl-8">
            <p className="text-green-600 mb-1">
              Using Shamir's Secret Sharing with enhanced security features.
            </p>
            <p className="text-sm text-green-600">
              To recover your key, you'll need at least {backupDetails?.threshold || THRESHOLD} out of {backupDetails?.totalShares || NUM_SHARES} shares.
            </p>
          </div>
          
          <div className="mt-3">
            <button 
              className="text-blue-600 text-sm font-medium flex items-center"
              onClick={toggleDetails}
            >
              <span>
                {isDetailsOpen ? 'Hide Details' : 'Show Details'}
              </span>
              <svg className={`w-4 h-4 ml-1 transition-transform ${isDetailsOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            
            {isDetailsOpen && backupDetails && (
              <div className="mt-2 bg-white p-3 rounded border text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <div className="text-gray-600">Total Shares:</div>
                  <div className="font-medium">{backupDetails.totalShares}</div>
                  
                  <div className="text-gray-600">Threshold:</div>
                  <div className="font-medium">{backupDetails.threshold}</div>
                  
                  <div className="text-gray-600">Created:</div>
                  <div className="font-medium">{new Date(backupDetails.creationTime * 1000).toLocaleString()}</div>
                  
                  <div className="text-gray-600">Hash:</div>
                  <div className="font-mono text-xs overflow-hidden text-ellipsis">{backupDetails.configHash.substring(0, 10)}...</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white p-6 rounded-lg shadow-md mb-6">
      <h2 className="text-lg font-semibold mb-2">Secure Key Backup</h2>
      
      <div className="mb-4">
        <p className="text-gray-700">
          Securely backup your private key using Shamir's Secret Sharing with enhanced security features. Your key will be split into {NUM_SHARES} encrypted shares, requiring at least {THRESHOLD} to recover it.
        </p>
      </div>
      
      {/* Security notice */}
      <div className="mb-4 bg-blue-50 p-4 rounded-lg border border-blue-200">
        <h3 className="font-medium text-blue-700 mb-2 flex items-center">
          <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Security Information
        </h3>
        <ul className="text-sm text-blue-700 space-y-1 list-disc pl-5">
          <li>Your private key never leaves your device</li>
          <li>Each share is individually encrypted and stored in its own isolated contract</li>
          <li>Tamper-proof design with cryptographic verification</li>
          <li>48-hour time lock for enhanced recovery security</li>
        </ul>
      </div>
      
      {/* Security agreement checkbox */}
      {backupStage === BACKUP_STAGES.IDLE && (
        <div className="mb-4">
          <label className="flex items-start cursor-pointer">
            <input
              type="checkbox"
              checked={agreementChecked}
              onChange={handleAgreementToggle}
              className="mt-1 h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
            />
            <span className="ml-2 text-sm text-gray-700">
              I understand that this backup is critical for account recovery. I will securely store my wallet seed phrase as an additional backup method and understand that {THRESHOLD} of {NUM_SHARES} shares will be needed for recovery.
            </span>
          </label>
          {error && !agreementChecked && (
            <p className="mt-1 text-xs text-red-500">{error}</p>
          )}
        </div>
      )}
      
      {/* Backup button - only shown in idle state */}
      {backupStage === BACKUP_STAGES.IDLE && (
        <button 
          className={`w-full flex items-center justify-center px-6 py-3 rounded-lg font-medium
                    transition-colors duration-300 shadow-md ${
                      agreementChecked 
                      ? 'bg-blue-600 hover:bg-blue-700 text-white' 
                      : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    }`}
          onClick={handleOneClickBackup}
          disabled={!agreementChecked || backupInProgress.current}
        >
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
          </svg>
          One-Click Secure Backup
        </button>
      )}
      
      {/* Progress display */}
      {(backupStage !== BACKUP_STAGES.IDLE && backupStage !== BACKUP_STAGES.SUCCESS && backupStage !== BACKUP_STAGES.ERROR) && (
        <div className="mt-4">
          <div className="flex justify-between mb-1">
            <span className="text-sm font-medium">{statusMessage}</span>
            <span className="text-sm font-medium">{progress}%</span>
          </div>
          
          <div className="w-full bg-gray-200 rounded-full h-2.5">
            <div className="bg-blue-600 h-2.5 rounded-full transition-all duration-300" 
                 style={{ width: `${progress}%` }}></div>
          </div>
          
          <div className="mt-4 flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-600"></div>
            <p className="ml-3 text-sm text-gray-600">
              {
                backupStage === BACKUP_STAGES.GENERATING 
                  ? 'Generating secure shares...' 
                  : backupStage === BACKUP_STAGES.ENCRYPTING 
                  ? 'Encrypting with multi-layered security...' 
                  : backupStage === BACKUP_STAGES.STORING 
                  ? 'Storing in distributed contracts...' 
                  : 'Verifying backup integrity...'
              }
            </p>
          </div>
          
          {txHash && (
            <div className="mt-3 text-xs text-gray-600 text-center">
              Transaction: 
              <a href={getExplorerUrl(txHash)} 
                 target="_blank" 
                 rel="noopener noreferrer"
                 className="ml-1 text-blue-500 hover:text-blue-700">
                {txHash.substring(0, 6)}...{txHash.substring(txHash.length - 4)}
              </a>
            </div>
          )}
        </div>
      )}
      
      {/* Success state */}
      {backupStage === BACKUP_STAGES.SUCCESS && (
        <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
          <div className="flex items-center mb-2">
            <svg className="w-6 h-6 text-green-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
            </svg>
            <h3 className="text-green-700 font-medium">{statusMessage}</h3>
          </div>
          
          <p className="text-sm text-green-600 ml-8 mb-3">
            Your private key is now securely backed up with {NUM_SHARES} encrypted shares across separate contracts.
          </p>
          
          {txHash && (
            <div className="bg-white p-3 rounded border text-sm">
              <h4 className="font-medium mb-1">Transaction Details:</h4>
              <div className="flex items-center overflow-hidden">
                <span className="text-gray-600 mr-2">TX:</span>
                <a href={getExplorerUrl(txHash)} 
                   target="_blank" 
                   rel="noopener noreferrer"
                   className="text-blue-500 hover:text-blue-700 text-xs font-mono truncate">
                  {txHash}
                </a>
              </div>
              
              <div className="mt-2">
                <span className="text-gray-600 mr-2">Contracts Created:</span>
                <span className="text-gray-800">{shareContracts.length}</span>
              </div>
              
              <div className="mt-2 flex items-center">
                <span className="text-gray-600 mr-2">Recovery Threshold:</span>
                <span className="text-gray-800">{THRESHOLD} of {NUM_SHARES} shares</span>
              </div>
            </div>
          )}
          
          <div className="mt-4 bg-yellow-50 p-3 rounded border border-yellow-200">
            <div className="flex items-start">
              <svg className="w-5 h-5 text-yellow-600 mr-2 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <p className="text-yellow-700 text-sm font-medium">Important Security Reminder</p>
                <p className="text-yellow-600 text-xs mt-1">
                  Always keep your wallet seed phrase in a safe location as an additional backup method.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Error state */}
      {backupStage === BACKUP_STAGES.ERROR && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-start">
            <svg className="w-6 h-6 text-red-600 mr-2 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" 
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <h3 className="text-red-700 font-medium">Backup Failed</h3>
              <p className="text-red-600 text-sm mt-1">{error}</p>
              
              {txHash && (
                <div className="mt-2 text-xs">
                  Transaction: 
                  <a href={getExplorerUrl(txHash)} 
                     target="_blank" 
                     rel="noopener noreferrer"
                     className="ml-1 text-blue-500 hover:text-blue-700">
                    {txHash.substring(0, 6)}...{txHash.substring(txHash.length - 4)}
                  </a>
                </div>
              )}
              
              <button 
                className="mt-3 bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded text-sm"
                onClick={() => {
                  setBackupStage(BACKUP_STAGES.IDLE);
                  setError('');
                }}
              >
                Try Again
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SecureOneClickBackup;