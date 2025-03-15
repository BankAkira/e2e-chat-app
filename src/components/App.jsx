import React from 'react';
import { WalletProvider } from '../context/WalletContext';
import { KeyPairProvider } from '../context/KeyPairContext';

// Wallet components
import WalletConnector from './Wallet/WalletConnector';

// Key management components
import KeyGenerator from './KeyManagement/KeyGenerator';
import KeyBackup from './KeyManagement/KeyBackup';
import KeyRecovery from './KeyManagement/KeyRecovery';
import SecureOneClickBackup from './KeyManagement/SecureOneClickBackup';
import RecoveryAddresses from './KeyManagement/RecoveryAddresses';

// Chat components
import ChatInterface from './Chat/ChatInterface';

const App = () => {
  return (
    <WalletProvider>
      <KeyPairProvider>
        <div className="min-h-screen bg-gray-50 p-6">
          <div className="max-w-4xl mx-auto">
            <header className="mb-8 text-center">
              <h1 className="text-3xl font-bold mb-2">E2E Encrypted Chat</h1>
              <p className="text-gray-600">
                Secure messaging with ECC cryptography and Shamir's Secret Sharing key backup
              </p>
            </header>
            
            {/* Main sections */}
            <main>
              {/* Wallet connection */}
              <section className="mb-8">
                <WalletConnector />
              </section>
              
              {/* Key management */}
              <section className="mb-8">
                <h2 className="text-xl font-bold mb-4 border-b pb-2">Key Management</h2>
                <KeyGenerator />
                <SecureOneClickBackup />
                <KeyRecovery />
                <RecoveryAddresses />
              </section>
              
              {/* Chat interface */}
              <section className="mb-8">
                <h2 className="text-xl font-bold mb-4 border-b pb-2">Encrypted Messaging</h2>
                <ChatInterface />
              </section>
            </main>
            
            {/* Footer */}
            <footer className="mt-12 text-center text-gray-500 text-sm">
              <p>
                Built with ECC, Shamir's Secret Sharing, and Distributed Smart Contracts
              </p>
              <p className="mt-1">
                MIT License © {new Date().getFullYear()}
              </p>
            </footer>
          </div>
        </div>
      </KeyPairProvider>
    </WalletProvider>
  );
};

export default App;