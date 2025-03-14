import React from 'react';
import { useWallet } from '../../context/WalletContext';

const WalletConnector = () => {
  const { account, isConnected, connectWallet, disconnectWallet } = useWallet();
  
  return (
    <div className="bg-gray-100 p-4 rounded-lg mb-6">
      <h2 className="text-lg font-semibold mb-2">Wallet Connection</h2>
      
      {isConnected ? (
        <div>
          <p className="mb-2">
            Connected: 
            <span className="font-mono ml-2">
              {account.substring(0, 6)}...{account.substring(38)}
            </span>
          </p>
          
          <button 
            className="bg-red-500 text-white px-3 py-1 rounded text-sm"
            onClick={disconnectWallet}
          >
            Disconnect
          </button>
        </div>
      ) : (
        <div>
          <p className="mb-2">Connect your Ethereum wallet to use the application.</p>
          
          <button 
            className="bg-blue-500 text-white px-4 py-2 rounded"
            onClick={connectWallet}
          >
            Connect Wallet
          </button>
        </div>
      )}
    </div>
  );
};

export default WalletConnector;