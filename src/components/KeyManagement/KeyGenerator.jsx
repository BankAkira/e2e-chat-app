import React, { useState } from 'react';
import { useKeyPair } from '../../context/KeyPairContext';

const KeyGenerator = () => {
  const { 
    keyPair, 
    isKeyRegistered,
    generateKeyPair, 
    registerPublicKey 
  } = useKeyPair();
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [copySuccess, setCopySuccess] = useState('');
  
  const handleGenerateKey = async () => {
    try {
      setIsGenerating(true);
      await generateKeyPair();
    } catch (error) {
      console.error("Error generating key:", error);
    } finally {
      setIsGenerating(false);
    }
  };
  
  const handleRegisterKey = async () => {
    try {
      setIsRegistering(true);
      await registerPublicKey();
    } catch (error) {
      console.error("Error registering key:", error);
    } finally {
      setIsRegistering(false);
    }
  };
  
  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text)
      .then(() => {
        setCopySuccess('Copied!');
        setTimeout(() => setCopySuccess(''), 2000);
      })
      .catch(err => {
        console.error('Failed to copy text: ', err);
      });
  };
  
  return (
    <div className="bg-gray-100 p-4 rounded-lg mb-6">
      <h2 className="text-lg font-semibold mb-2">ECC Key Management</h2>
      
      {keyPair ? (
        <div>
          <div className="p-3 bg-white rounded border mb-3">
            <div className="flex justify-between items-center mb-1">
              <span className="font-medium">Public Key:</span>
              <button 
                className="text-blue-500 text-xs"
                onClick={() => copyToClipboard(keyPair.publicKey)}
              >
                {copySuccess && copySuccess === 'Copied!' ? copySuccess : 'Copy'}
              </button>
            </div>
            <p className="font-mono text-sm break-all">{keyPair.publicKey.substring(0, 20)}...</p>
          </div>
          
          <div className="p-3 bg-white rounded border mb-3">
            <div className="flex justify-between items-center mb-1">
              <span className="font-medium">Private Key:</span>
              <div>
                <button 
                  className="text-blue-500 text-xs mr-2"
                  onClick={() => setShowPrivateKey(!showPrivateKey)}
                >
                  {showPrivateKey ? 'Hide' : 'Show'}
                </button>
                <button 
                  className="text-blue-500 text-xs"
                  onClick={() => copyToClipboard(keyPair.privateKey)}
                >
                  Copy
                </button>
              </div>
            </div>
            {showPrivateKey ? (
              <p className="font-mono text-sm break-all">{keyPair.privateKey}</p>
            ) : (
              <p className="font-mono text-sm">••••••••••••••••••••••••••••••••</p>
            )}
            <p className="text-xs text-red-500 mt-1">
              Never share your private key with anyone!
            </p>
          </div>
          
          {!isKeyRegistered ? (
            <button 
              className="bg-green-500 text-white px-4 py-2 rounded mr-2"
              onClick={handleRegisterKey}
              disabled={isRegistering}
            >
              {isRegistering ? 'Registering...' : 'Register Key on Blockchain'}
            </button>
          ) : (
            <div className="bg-green-100 p-2 rounded border border-green-300 text-green-700">
              <p className="text-sm">✓ Key registered on blockchain</p>
            </div>
          )}
        </div>
      ) : (
        <div>
          <p className="mb-3">
            Generate a new ECC key pair for secure communication and backups.
          </p>
          
          <button 
            className="bg-blue-500 text-white px-4 py-2 rounded"
            onClick={handleGenerateKey}
            disabled={isGenerating}
          >
            {isGenerating ? 'Generating...' : 'Generate New Key Pair'}
          </button>
        </div>
      )}
    </div>
  );
};

export default KeyGenerator;