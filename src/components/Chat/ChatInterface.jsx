import React, { useState, useEffect } from 'react';
import { useWallet } from '../../context/WalletContext';
import { useKeyPair } from '../../context/KeyPairContext';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import EccService from '../../services/cryptography/EccService';

const ChatInterface = () => {
  const { account } = useWallet();
  const { keyPair, isKeyRegistered, isBackedUp, getContactPublicKey } = useKeyPair();
  
  const [contactAddress, setContactAddress] = useState('');
  const [contactPublicKey, setContactPublicKey] = useState(null);
  const [isContactValid, setIsContactValid] = useState(false);
  const [messages, setMessages] = useState([]);
  const [isLoadingContact, setIsLoadingContact] = useState(false);
  const [error, setError] = useState('');
  
  // Check if ready to chat (all prerequisites met)
  const isReadyToChat = isKeyRegistered && isBackedUp && isContactValid;
  
  // Reset contact validity when address changes
  useEffect(() => {
    setContactPublicKey(null);
    setIsContactValid(false);
  }, [contactAddress]);
  
  const validateEthereumAddress = (address) => {
    // Basic Ethereum address validation
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  };
  
  const handleFetchPublicKey = async () => {
    if (!validateEthereumAddress(contactAddress)) {
      setError("Invalid Ethereum address format");
      return;
    }
    
    if (contactAddress.toLowerCase() === account.toLowerCase()) {
      setError("Cannot chat with yourself");
      return;
    }
    
    setIsLoadingContact(true);
    setError('');
    
    try {
      const publicKeyHex = await getContactPublicKey(contactAddress);
      
      if (publicKeyHex) {
        setContactPublicKey(publicKeyHex);
        setIsContactValid(true);
      } else {
        setError("Contact has no registered public key");
      }
    } catch (error) {
      console.error("Error fetching contact public key:", error);
      setError(`Failed to fetch public key: ${error.message}`);
    } finally {
      setIsLoadingContact(false);
    }
  };
  
  const handleSendMessage = async (messageText) => {
    if (!isReadyToChat || !contactPublicKey || !keyPair) {
      return;
    }
    
    try {
      // Encrypt message with contact's public key
      const encryptedData = await EccService.encrypt(contactPublicKey, messageText);
      
      // In a real app, you would send this to a messaging server or use a decentralized protocol
      // For demo purposes, we'll just add it to the local messages array
      const newMessage = {
        content: messageText,
        sender: account,
        recipient: contactAddress,
        timestamp: Date.now(),
        encrypted: encryptedData // This would be sent to the recipient
      };
      
      setMessages([...messages, newMessage]);
      
      // Simulate a response for demo purposes
      setTimeout(() => {
        const responseMessage = {
          content: "This is a simulated response from " + contactAddress.substring(0, 6) + "...",
          sender: contactAddress,
          recipient: account,
          timestamp: Date.now()
        };
        
        setMessages(prevMessages => [...prevMessages, responseMessage]);
      }, 1000);
      
    } catch (error) {
      console.error("Error sending message:", error);
      setError(`Failed to send message: ${error.message}`);
    }
  };
  
  if (!isKeyRegistered) {
    return (
      <div className="bg-gray-100 p-4 rounded-lg">
        <h2 className="text-lg font-semibold mb-2">Encrypted Chat</h2>
        <p className="text-gray-500">
          Register your key on the blockchain first to enable encrypted chat.
        </p>
      </div>
    );
  }
  
  if (!isBackedUp) {
    return (
      <div className="bg-gray-100 p-4 rounded-lg">
        <h2 className="text-lg font-semibold mb-2">Encrypted Chat</h2>
        <p className="text-gray-500">
          Backup your private key first to enable encrypted chat.
        </p>
      </div>
    );
  }
  
  return (
    <div className="bg-gray-100 p-4 rounded-lg">
      <h2 className="text-lg font-semibold mb-2">Encrypted Chat</h2>
      
      {/* Contact Selection */}
      <div className="mb-4">
        <label className="block text-sm font-medium mb-1">Chat with:</label>
        <div className="flex">
          <input
            type="text"
            value={contactAddress}
            onChange={(e) => setContactAddress(e.target.value)}
            placeholder="Contact's Ethereum address"
            className="border p-2 flex-grow mr-2 rounded"
          />
          <button 
            className={`px-3 py-1 rounded ${
              isLoadingContact
                ? 'bg-gray-400 text-white'
                : isContactValid
                  ? 'bg-green-500 text-white'
                  : 'bg-blue-500 text-white'
            }`}
            onClick={handleFetchPublicKey}
            disabled={isLoadingContact || isContactValid}
          >
            {isLoadingContact 
              ? 'Loading...' 
              : isContactValid 
                ? 'Connected' 
                : 'Connect'}
          </button>
        </div>
        
        {error && (
          <p className="text-red-500 text-sm mt-1">{error}</p>
        )}
        
        {isContactValid && (
          <div className="bg-green-50 p-2 mt-2 rounded border border-green-200">
            <p className="text-sm text-green-700">
              ✓ Connected to {contactAddress.substring(0, 6)}...{contactAddress.substring(38)}
            </p>
            <p className="text-xs text-gray-600 mt-1">
              Public Key: {contactPublicKey.substring(0, 10)}...
            </p>
          </div>
        )}
      </div>
      
      {/* Messages */}
      <MessageList messages={messages} />
      
      {/* Message Input */}
      <MessageInput 
        onSendMessage={handleSendMessage} 
        isDisabled={!isReadyToChat}
      />
      
      {!isReadyToChat && (
        <p className="text-sm text-gray-500 mt-2">
          {isContactValid 
            ? "Ready to chat!" 
            : "Connect with a contact to start chatting"}
        </p>
      )}
    </div>
  );
};

export default ChatInterface;