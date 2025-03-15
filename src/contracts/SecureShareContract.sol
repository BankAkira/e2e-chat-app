// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/**
 * @title IShareRegistry
 * @dev Interface for the share registry to check authorization
 */
interface IShareRegistry {
    function isAuthorizedForShare(address owner, address accessor) external view returns (bool);
}

/**
 * @title SecureShareContract
 * @dev Individual contract to store a single encrypted share with enhanced security
 */
contract SecureShareContract {
    using ECDSA for bytes32;
    
    // Immutable variables for security (cannot be changed after deployment)
    address public immutable owner;
    address public immutable registry;
    
    // Storage variables
    bytes private encryptedShare;
    bool public isActive = true;
    uint256 public lastAccessed;
    uint256 public accessCount;
    
    // Access control
    mapping(address => uint256) public lastAccessByAddress;
    
    // Events with indexed parameters for easier querying
    event ShareAccessed(address indexed accessor, uint256 timestamp, bytes32 indexed accessNonce);
    event ShareDeactivated(address indexed deactivator, uint256 timestamp);
    event ShareUpdated(address indexed updater, uint256 timestamp, bytes32 contentHash);
    
    // Modifiers
    modifier onlyOwnerOrRegistry() {
        require(msg.sender == owner || msg.sender == registry, "Not authorized");
        _;
    }
    
    modifier onlyActive() {
        require(isActive, "Share is inactive");
        _;
    }
    
    /**
     * @dev Constructor
     * @param _owner Owner of the share
     * @param _registry Registry contract address
     * @param _encryptedShare Encrypted share data
     */
    constructor(address _owner, address _registry, bytes memory _encryptedShare) {
        require(_owner != address(0), "Invalid owner");
        require(_registry != address(0), "Invalid registry");
        require(_encryptedShare.length > 0, "Empty share data");
        
        owner = _owner;
        registry = _registry;
        encryptedShare = _encryptedShare;
    }
    
    /**
     * @dev Get the encrypted share data
     * @return Encrypted share data
     */
    function getShare() external onlyActive returns (bytes memory) {
        // Check authorization through registry or direct owner
        bool isAuthorized = msg.sender == owner;
        if (!isAuthorized) {
            try IShareRegistry(registry).isAuthorizedForShare(owner, msg.sender) returns (bool result) {
                isAuthorized = result;
            } catch {
                isAuthorized = false;
            }
        }
        
        require(isAuthorized, "Not authorized for this share");
        
        // Rate limiting - prevent too frequent access
        if (msg.sender != owner) {
            require(
                block.timestamp - lastAccessByAddress[msg.sender] >= 5 minutes,
                "Access too frequent"
            );
        }
        
        // Update access records
        lastAccessed = block.timestamp;
        lastAccessByAddress[msg.sender] = block.timestamp;
        accessCount++;
        
        // Generate unique nonce for tracking this access
        bytes32 accessNonce = keccak256(abi.encodePacked(
            owner,
            msg.sender,
            encryptedShare,
            block.timestamp,
            accessCount
        ));
        
        emit ShareAccessed(msg.sender, block.timestamp, accessNonce);
        return encryptedShare;
    }
    
    /**
     * @dev Deactivate this share
     */
    function deactivate() external onlyOwnerOrRegistry {
        isActive = false;
        emit ShareDeactivated(msg.sender, block.timestamp);
    }
    
    /**
     * @dev Update the encrypted share data
     * @param _newEncryptedShare New encrypted share data
     */
    function updateShare(bytes calldata _newEncryptedShare) external onlyOwnerOrRegistry onlyActive {
        require(_newEncryptedShare.length > 0, "Empty share data");
        encryptedShare = _newEncryptedShare;
        
        bytes32 contentHash = keccak256(abi.encodePacked(_newEncryptedShare));
        emit ShareUpdated(msg.sender, block.timestamp, contentHash);
    }
    
    /**
     * @dev Emergency function to destroy this contract
     * @param emergencyCode Verification code to prevent accidental destruction
     */
    // function emergencyDestroy(bytes32 emergencyCode) external onlyOwnerOrRegistry {
    //     // Verify emergency code to prevent accidental destruction
    //     require(
    //         emergencyCode == keccak256(abi.encodePacked("EMERGENCY_DESTROY", owner, address(this))),
    //         "Invalid emergency code"
    //     );
        
    //     // Self-destruct sending funds to owner
    //     selfdestruct(payable(owner));
    // }
    
    /**
     * @dev Check if a caller is authorized to access this share
     * @param caller Address to check authorization for
     * @return True if authorized
     */
    function isAuthorized(address caller) external view returns (bool) {
        if (caller == owner) return true;
        
        try IShareRegistry(registry).isAuthorizedForShare(owner, caller) returns (bool result) {
            return result;
        } catch {
            return false;
        }
    }
}
