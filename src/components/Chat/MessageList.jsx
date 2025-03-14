import React, { useRef, useEffect } from 'react';
import { useWallet } from '../../context/WalletContext';

const MessageList = ({ messages }) => {
  const { account } = useWallet();
  const messageEndRef = useRef(null);
  
  // Auto-scroll to the bottom when messages change
  useEffect(() => {
    if (messageEndRef.current) {
      messageEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);
  
  if (!messages || messages.length === 0) {
    return (
      <div className="border bg-white p-4 rounded h-64 overflow-y-auto flex items-center justify-center">
        <p className="text-gray-500 text-center">No messages yet</p>
      </div>
    );
  }
  
  return (
    <div className="border bg-white p-4 rounded h-64 overflow-y-auto">
      {messages.map((msg, index) => (
        <div 
          key={index} 
          className={`mb-2 p-2 rounded max-w-xs ${
            msg.sender === account 
              ? 'bg-blue-100 ml-auto text-right' 
              : 'bg-gray-200'
          }`}
        >
          <p className="text-sm">{msg.content}</p>
          <p className="text-xs text-gray-500">
            {new Date(msg.timestamp).toLocaleTimeString()}
          </p>
        </div>
      ))}
      <div ref={messageEndRef} />
    </div>
  );
};

export default MessageList;