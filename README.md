# E2E Encrypted Chat App with Blockchain Key Management

This React application demonstrates end-to-end encrypted chat with decentralized key management using blockchain-based smart contracts and Shamir's Secret Sharing.

## 🔒 Features

- **End-to-End Encryption**: All messages are encrypted using Elliptic Curve Cryptography
- **On-Chain Key Registry**: Public keys stored on Ethereum blockchain
- **Secure Key Backup**: Private keys backed up using Shamir's Secret Sharing
- **Decentralized Storage**: Encrypted key shares stored in distributed smart contracts
- **Social Recovery**: Designate trusted contacts to help recover lost keys
- **Modern Cryptography**: Uses the Web Crypto API and secp256k1 ECDH

## 🔄 System Workflow

1. **Key Generation & Registration**
   - Generate secp256k1 key pair (public & private key)
   - Register public key on the blockchain via ECCOperations contract
   - Other users can discover and fetch your public key for secure messaging

2. **Private Key Backup**
   - Split private key into 5 shares where any 3 can reconstruct the original (Shamir's Secret Sharing)
   - Encrypt each share with user's public key
   - Store encrypted shares in distributed storage via smart contracts

3. **Recovery Setup**
   - Designate trusted Ethereum addresses for recovery
   - These addresses get permission to access encrypted shares if needed

4. **Encrypted Messaging**
   - Fetch recipient's public key from blockchain
   - Encrypt message using recipient's public key
   - Only recipient with corresponding private key can decrypt

5. **Key Recovery (if needed)**
   - Recover at least 3 shares from the distributed registry
   - Reconstruct private key using Shamir's Secret Sharing
   - Import recovered key back into application

## 📋 Prerequisites

- Node.js (v18+) and npm
- Ethereum wallet (e.g., MetaMask)
- Access to an Ethereum network (mainnet, testnet, or local)

## 🚀 Getting Started

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/e2e-chat-app.git
   cd e2e-chat-app
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure contract addresses:
   - Deploy the smart contracts or use existing deployments
   - Update `src/constants/contractAddresses.js` with your contract addresses

4. Start the development server:
   ```bash
   npm run dev
   ```

## 🏗️ Project Structure

```
src/
├── components/
│   ├── App.jsx                 # Main application component
│   ├── KeyManagement/          # Key management components
│   │   ├── KeyGenerator.jsx    # ECC key pair generation
│   │   ├── KeyBackup.jsx       # Shamir's Secret Sharing backup
│   │   ├── KeyRecovery.jsx     # Private key recovery
│   │   └── RecoveryAddresses.jsx # Trusted recovery contacts
│   ├── Chat/                   # Chat components
│   │   ├── ChatInterface.jsx   # Main chat interface
│   │   ├── MessageList.jsx     # Display messages
│   │   └── MessageInput.jsx    # Send messages
│   └── Wallet/
│       └── WalletConnector.jsx # Ethereum wallet connection
├── services/
│   ├── contracts/              # Smart contract services
│   │   ├── ECCOperationsService.js
│   │   ├── ShamirSecretSharingService.js
│   │   └── DistributedSSSRegistryService.js
│   └── cryptography/
│       └── EccService.js       # Cryptography operations
├── context/
│   ├── WalletContext.jsx       # Wallet connection state
│   └── KeyPairContext.jsx      # Key management state
└── constants/
    └── contractAddresses.js    # Contract addresses
```

## 🔐 Smart Contracts

This application interacts with the following Solidity smart contracts:

1. **ECCOperations.sol**: Manages public key registration and verification
2. **ShamirSecretSharing.sol**: Implements Shamir's Secret Sharing algorithm
3. **DistributedSSSRegistry.sol**: Manages distributed storage of encrypted shares
4. **ShareStorage.sol**: Individual contract for each encrypted share
5. **ProductionShareFactory.sol**: Factory for creating ShareStorage contracts

## 📚 Technical Details

### Cryptography

- **Elliptic Curve**: secp256k1 (same as Ethereum)
- **Key Exchange**: ECDH with SHA-256
- **Symmetric Encryption**: AES-GCM
- **Secret Sharing**: Shamir's t-of-n threshold scheme

### Security Features

- Uses the browser's Web Crypto API for cryptographic operations
- Zero-knowledge design: private keys never leave the client
- Threshold cryptography prevents single points of failure
- On-chain verification ensures secure operations

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- Based on the smart contracts by [BankAkira](https://github.com/bankakira)