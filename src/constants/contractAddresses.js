// Contract addresses for different networks
const CONTRACT_ADDRESSES = {
    // Mainnet addresses
    1: {
      ECCOperations: "0x1234567890123456789012345678901234567890",
      ShamirSecretSharing: "0x2345678901234567890123456789012345678901",
      DistributedSSSRegistry: "0x3456789012345678901234567890123456789012"
    },
    // Sepolia testnet addresses
    11155111: {
      ECCOperations: "0x9876543210987654321098765432109876543210",
      ShamirSecretSharing: "0x8765432109876543210987654321098765432109",
      DistributedSSSRegistry: "0x7654321098765432109876543210987654321098"
    },
    // kub testnet addresses
    25925: {
        ECCOperations: "0x08fD308D017D974897259155900c020aa2274aA2",
        ShamirSecretSharing: "0x2eeD6d14e65C6BFDb7Bc583c4A757582754b200B",
        DistributedSSSRegistry: "0xDc1CD950791D95d2ceE0e6748985865ccC155074"
      },
    // Local development addresses
    1337: {
      ECCOperations: "0x5555555555555555555555555555555555555555",
      ShamirSecretSharing: "0x6666666666666666666666666666666666666666",
      DistributedSSSRegistry: "0x7777777777777777777777777777777777777777"
    }
  };
  
  // Get contract address based on chain ID
  export const getContractAddress = (contractName, chainId = 1) => {
    // Default to mainnet if chain not supported
    const network = CONTRACT_ADDRESSES[chainId] || CONTRACT_ADDRESSES[1];
    return network[contractName];
  };
  
  export default CONTRACT_ADDRESSES;