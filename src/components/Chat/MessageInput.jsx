import React, { useState } from 'react';

const MessageInput = ({ onSendMessage, isDisabled }) => {
  const [message, setMessage] = useState('');
  
  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (message.trim() && !isDisabled) {
      onSendMessage(message);
      setMessage('');
    }
  };
  
  return (
    <form onSubmit={handleSubmit} className="flex mt-4">
      <input
        type="text"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Type a message..."
        className="border p-2 flex-grow mr-2 rounded"
        disabled={isDisabled}
      />
      <button 
        type="submit"
        className={`px-4 py-2 rounded ${
          isDisabled
            ? 'bg-gray-400 text-gray-200 cursor-not-allowed'
            : 'bg-blue-500 text-white hover:bg-blue-600'
        }`}
        disabled={isDisabled}
      >
        Send
      </button>
    </form>
  );
};

export default MessageInput;