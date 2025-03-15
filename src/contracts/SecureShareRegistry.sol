// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "./SecureShareContract.sol";

/**
 * @title SecureShareRegistry
 * @dev Registry contract to manage individual share contracts with enhanced security
 */
contract SecureShareRegistry is Ownable, Pausable, ReentrancyGuard {
    using ECDSA for bytes32;
    
    // Version for upgrade compatibility
    uint8 public constant VERSION = 1;
    
    // Service fee configuration
    uint256 public serviceFee;
    address public feeCollector;
    
    // User share details
    struct ShareConfig {
        uint256 totalShares;
        uint256 threshold;
        uint256 creationTime;
        bool isActive;
        bytes32 configHash;
    }
    
    // Time-locked recovery request
    struct RecoveryRequest {
        address initiator;
        uint256 requestTime;
        uint256 expiresAt;
        bytes32 requestHash;
        bool isActive;
    }
    
    // Mappings
    mapping(address => ShareConfig) private shareConfigs;
    mapping(address => address[]) private userShares;
    mapping(address => address[]) private recoveryAddresses;
    mapping(address => address) public emergencyContacts;
    mapping(address => RecoveryRequest) public recoveryRequests;
    mapping(address => bool) public blacklisted;
    mapping(address => bool) public feeExemptions;
    
    // Security throttling
    mapping(address => uint256) public lastActionTimestamp;
    mapping(address => uint256) public failedAttempts;
    uint256 public constant THROTTLE_DURATION = 5 minutes;
    uint256 public constant MAX_FAILED_ATTEMPTS = 5;
    
    // Domain separator for EIP-712 signatures
    bytes32 private immutable DOMAIN_SEPARATOR;
    
    // Events
    event SharesStored(
        address indexed user,
        uint256 totalShares,
        uint256 threshold,
        bytes32 configHash
    );
    
    event SharesRevoked(
        address indexed user,
        uint256 timestamp
    );
    
    event RecoveryAddressAdded(
        address indexed user,
        address indexed recoveryAddress,
        uint256 expiresAt
    );
    
    event RecoveryAddressRemoved(
        address indexed user,
        address indexed recoveryAddress
    );
    
    event EmergencyContactSet(
        address indexed user,
        address indexed contact
    );
    
    event RecoveryRequested(
        address indexed user,
        address indexed initiator,
        uint256 requestTime,
        uint256 expiresAt,
        bytes32 requestHash
    );
    
    event RecoveryCancelled(
        address indexed user,
        address indexed canceller,
        uint256 timestamp
    );
    
    event ServiceFeeChanged(
        uint256 previousFee,
        uint256 newFee
    );
    
    event SecurityAlert(
        address indexed subject,
        string alertType, 
        uint256 timestamp,
        bytes32 detailsHash
    );
    
    /**
     * @dev Record a failed attempt by an address
     * @param account Address that failed
     */
    function _recordFailedAttempt(address account) internal {
        failedAttempts[account]++;
        lastActionTimestamp[account] = block.timestamp;
        
        if (failedAttempts[account] >= MAX_FAILED_ATTEMPTS) {
            emit SecurityAlert(
                account,
                "RATE_LIMITED",
                block.timestamp,
                keccak256(abi.encodePacked(account, "RATE_LIMITED", block.timestamp))
            );
        }
    }
    
    /**
     * @dev Receive function to accept ETH
     */
    receive() external payable {
        // Simply accept ETH
        // ETH sent directly to contract will be considered a donation
    }
    
    /**
     * @dev Fallback function
     */
    fallback() external payable {
        // Revert on unknown function calls
        revert("Function not supported");
    }
    /**
     * @dev Constructor
     * @param initialServiceFee Initial service fee
     * @param initialFeeCollector Address to collect fees
     */
    constructor(uint256 initialServiceFee, address initialFeeCollector) {
        require(initialFeeCollector != address(0), "Invalid fee collector");
        
        serviceFee = initialServiceFee;
        feeCollector = initialFeeCollector;
        
        // Initialize EIP-712 domain separator
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes("SecureShareRegistry")),
                keccak256(bytes("1")),
                block.chainid,
                address(this)
            )
        );
    }
    
    /**
     * @dev Store encrypted shares for the sender - creates multiple contracts in one transaction
     * @param encryptedShareData Array of encrypted share data
     * @param threshold Minimum shares needed for reconstruction
     * @return shareContracts Addresses of created share contracts
     */
    function storeShares(bytes[] calldata encryptedShareData, uint256 threshold) 
        external 
        payable 
        whenNotPaused 
        nonReentrant 
        returns (address[] memory) 
    {
        // Security checks
        _checkBlacklist(msg.sender);
        _throttleRequests(msg.sender);
        
        // Business logic validation
        if (!feeExemptions[msg.sender]) {
            require(msg.value >= serviceFee, "Insufficient fee");
        }
        
        require(threshold > 0 && threshold <= encryptedShareData.length, "Invalid threshold");
        require(encryptedShareData.length >= 3, "Minimum 3 shares required");
        require(encryptedShareData.length <= 100, "Maximum 100 shares allowed");
        require(!hasShares(msg.sender), "Shares already exist");
        
        // Implementation
        address[] memory shareContracts = new address[](encryptedShareData.length);
        
        for (uint256 i = 0; i < encryptedShareData.length; i++) {
            // Validate share data
            require(encryptedShareData[i].length > 0, "Empty share data");
            
            // Deploy new share contract with proper security
            SecureShareContract newContract = new SecureShareContract(
                msg.sender,
                address(this),
                encryptedShareData[i]
            );
            
            shareContracts[i] = address(newContract);
            
            // Store contract address
            userShares[msg.sender].push(address(newContract));
        }
        
        // Calculate configuration hash for verification and security auditing
        bytes32 configHash = keccak256(
            abi.encodePacked(
                msg.sender,
                encryptedShareData.length,
                threshold,
                block.timestamp,
                shareContracts
            )
        );
        
        // Store share configuration
        shareConfigs[msg.sender] = ShareConfig({
            totalShares: encryptedShareData.length,
            threshold: threshold,
            creationTime: block.timestamp,
            isActive: true,
            configHash: configHash
        });
        
        // Transfer fee
        if (msg.value > 0) {
            (bool success, ) = feeCollector.call{value: msg.value}("");
            require(success, "Fee transfer failed");
        }
        
        // Update security tracking
        lastActionTimestamp[msg.sender] = block.timestamp;
        
        emit SharesStored(msg.sender, encryptedShareData.length, threshold, configHash);
        return shareContracts;
    }
    
    /**
     * @dev Store shares using a signature from the user (meta-transaction)
     * @param user User to store shares for
     * @param encryptedShareData Encrypted share data
     * @param threshold Threshold for reconstruction
     * @param deadline Deadline for signature validity
     * @param signature EIP-712 signature
     */
    function storeSharesFor(
        address user,
        bytes[] calldata encryptedShareData,
        uint256 threshold,
        uint256 deadline,
        bytes calldata signature
    ) 
        external 
        payable 
        whenNotPaused 
        nonReentrant 
        returns (address[] memory) 
    {
        // Check deadline
        require(block.timestamp <= deadline, "Signature expired");
        
        // Security checks
        _checkBlacklist(user);
        _checkBlacklist(msg.sender);
        _throttleRequests(msg.sender);
        
        // Business logic validation
        if (!feeExemptions[user] && !feeExemptions[msg.sender]) {
            require(msg.value >= serviceFee, "Insufficient fee");
        }
        
        require(threshold > 0 && threshold <= encryptedShareData.length, "Invalid threshold");
        require(encryptedShareData.length >= 3, "Minimum 3 shares required");
        require(encryptedShareData.length <= 100, "Maximum 100 shares allowed");
        require(!hasShares(user), "Shares already exist");
        
        // Verify signature
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256("StoreShares(address user,uint256 threshold,bytes32 dataHash,uint256 deadline)"),
                user,
                threshold,
                keccak256(abi.encodePacked(encryptedShareData)),
                deadline
            )
        );
        
        bytes32 digest = keccak256(
            abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash)
        );
        
        address recoveredSigner = digest.recover(signature);
        require(recoveredSigner == user, "Invalid signature");
        
        // Implementation
        address[] memory shareContracts = new address[](encryptedShareData.length);
        
        for (uint256 i = 0; i < encryptedShareData.length; i++) {
            // Validate share data
            require(encryptedShareData[i].length > 0, "Empty share data");
            
            // Deploy new share contract
            SecureShareContract newContract = new SecureShareContract(
                user,
                address(this),
                encryptedShareData[i]
            );
            
            shareContracts[i] = address(newContract);
            
            // Store contract address
            userShares[user].push(address(newContract));
        }
        
        // Calculate configuration hash
        bytes32 configHash = keccak256(
            abi.encodePacked(
                user,
                encryptedShareData.length,
                threshold,
                block.timestamp,
                shareContracts
            )
        );
        
        // Store share configuration
        shareConfigs[user] = ShareConfig({
            totalShares: encryptedShareData.length,
            threshold: threshold,
            creationTime: block.timestamp,
            isActive: true,
            configHash: configHash
        });
        
        // Transfer fee
        if (msg.value > 0) {
            (bool success, ) = feeCollector.call{value: msg.value}("");
            require(success, "Fee transfer failed");
        }
        
        // Update security tracking
        lastActionTimestamp[user] = block.timestamp;
        
        emit SharesStored(user, encryptedShareData.length, threshold, configHash);
        return shareContracts;
    }
    
    /**
     * @dev Revoke all shares for the sender
     */
    function revokeShares() external nonReentrant {
        require(hasShares(msg.sender), "No shares found");
        
        // Deactivate each share contract
        address[] storage shares = userShares[msg.sender];
        for (uint256 i = 0; i < shares.length; i++) {
            SecureShareContract(shares[i]).deactivate();
        }
        
        // Update configuration
        shareConfigs[msg.sender].isActive = false;
        
        // Update security tracking
        lastActionTimestamp[msg.sender] = block.timestamp;
        
        emit SharesRevoked(msg.sender, block.timestamp);
    }
    
    /**
     * @dev Get a share from a specific index
     * @param user Address of the user
     * @param index Index of the share
     * @return Encrypted share data
     */
    function getShare(address user, uint256 index) 
        external 
        nonReentrant 
        returns (bytes memory) 
    {
        require(hasShares(user), "No shares found");
        require(index < shareConfigs[user].totalShares, "Invalid share index");
        
        // Throttle requests for non-owners
        if (msg.sender != user) {
            _throttleRequests(msg.sender);
        }
        
        // Call the individual share contract to get the share
        // This will perform authorization checks
        return SecureShareContract(userShares[user][index]).getShare();
    }
    
    /**
     * @dev Initiate a time-locked recovery request
     * @param user Address to recover for
     */
    function initiateRecovery(address user) external nonReentrant {
        require(hasShares(user), "No shares found");
        require(
            msg.sender == emergencyContacts[user] || isRecoveryAddress(user, msg.sender),
            "Not authorized for recovery"
        );
        require(!recoveryRequests[user].isActive, "Recovery already initiated");
        
        // Security throttling
        _throttleRequests(msg.sender);
        
        // Set 48-hour time lock
        uint256 expiresAt = block.timestamp + 48 hours;
        
        // Create request hash for verification
        bytes32 requestHash = keccak256(abi.encodePacked(
            "RECOVERY_REQUEST",
            user,
            msg.sender,
            block.timestamp,
            expiresAt
        ));
        
        // Store recovery request
        recoveryRequests[user] = RecoveryRequest({
            initiator: msg.sender,
            requestTime: block.timestamp,
            expiresAt: expiresAt,
            requestHash: requestHash,
            isActive: true
        });
        
        // Update security tracking
        lastActionTimestamp[msg.sender] = block.timestamp;
        
        emit RecoveryRequested(
            user,
            msg.sender,
            block.timestamp,
            expiresAt,
            requestHash
        );
    }
    
    /**
     * @dev Cancel a recovery request
     * @param user Address for which to cancel recovery
     */
    function cancelRecovery(address user) external nonReentrant {
        RecoveryRequest storage request = recoveryRequests[user];
        
        require(request.isActive, "No active recovery");
        require(
            msg.sender == user || 
            msg.sender == request.initiator || 
            msg.sender == owner(),
            "Not authorized to cancel"
        );
        
        request.isActive = false;
        
        // Update security tracking
        lastActionTimestamp[msg.sender] = block.timestamp;
        
        emit RecoveryCancelled(user, msg.sender, block.timestamp);
    }
    
    /**
     * @dev Add a recovery address
     * @param recoveryAddress Address to add as recovery
     */
    function addRecoveryAddress(address recoveryAddress) external nonReentrant {
        require(recoveryAddress != address(0), "Invalid address");
        require(recoveryAddress != msg.sender, "Cannot add self as recovery");
        
        // Security checks
        _throttleRequests(msg.sender);
        _checkBlacklist(recoveryAddress);
        
        // Check if already added
        address[] storage addresses = recoveryAddresses[msg.sender];
        for (uint256 i = 0; i < addresses.length; i++) {
            require(addresses[i] != recoveryAddress, "Address already added");
        }
        
        // Limit the number of recovery addresses
        require(addresses.length < 10, "Too many recovery addresses");
        
        // Add the recovery address
        addresses.push(recoveryAddress);
        
        // One year expiration
        uint256 expiresAt = block.timestamp + 365 days;
        
        // Update security tracking
        lastActionTimestamp[msg.sender] = block.timestamp;
        
        emit RecoveryAddressAdded(
            msg.sender,
            recoveryAddress,
            expiresAt
        );
    }
    
    /**
     * @dev Remove a recovery address
     * @param recoveryAddress Address to remove
     */
    function removeRecoveryAddress(address recoveryAddress) external nonReentrant {
        // Security throttling
        _throttleRequests(msg.sender);
        
        address[] storage addresses = recoveryAddresses[msg.sender];
        uint256 length = addresses.length;
        bool found = false;
        uint256 index;
        
        for (uint256 i = 0; i < length; i++) {
            if (addresses[i] == recoveryAddress) {
                found = true;
                index = i;
                break;
            }
        }
        
        require(found, "Recovery address not found");
        
        // Remove by replacing with the last element and popping
        if (index < length - 1) {
            addresses[index] = addresses[length - 1];
        }
        addresses.pop();
        
        // Update security tracking
        lastActionTimestamp[msg.sender] = block.timestamp;
        
        emit RecoveryAddressRemoved(msg.sender, recoveryAddress);
    }
    
    /**
     * @dev Set an emergency contact
     * @param contact Emergency contact address
     */
    function setEmergencyContact(address contact) external nonReentrant {
        require(contact != address(0), "Invalid address");
        require(contact != msg.sender, "Cannot set self as emergency contact");
        
        // Security checks
        _throttleRequests(msg.sender);
        _checkBlacklist(contact);
        
        emergencyContacts[msg.sender] = contact;
        
        // Update security tracking
        lastActionTimestamp[msg.sender] = block.timestamp;
        
        emit EmergencyContactSet(msg.sender, contact);
    }
    
    // ===== View Functions =====
    
    /**
     * @dev Check if a user has shares stored
     * @param user Address of the user
     * @return True if user has shares
     */
    function hasShares(address user) public view returns (bool) {
        return shareConfigs[user].totalShares > 0 && shareConfigs[user].isActive;
    }
    
    /**
     * @dev Get share configuration for a user
     * @param user Address of the user
     * @return Share configuration
     */
    function getShareConfig(address user) 
        external 
        view 
        returns (ShareConfig memory) 
    {
        return shareConfigs[user];
    }
    
    /**
     * @dev Get all share contract addresses for a user
     * @param user Address of the user
     * @return Array of share contract addresses
     */
    function getUserShareContracts(address user) 
        external 
        view 
        returns (address[] memory) 
    {
        return userShares[user];
    }
    
    /**
     * @dev Check if an address is authorized to access a user's shares
     * @param owner Owner of the shares
     * @param accessor Address trying to access shares
     * @return True if authorized
     */
    function isAuthorizedForShare(address owner, address accessor) 
        external 
        view 
        returns (bool) 
    {
        // Owner is always authorized
        if (owner == accessor) {
            return true;
        }
        
        // Check if accessor is a recovery address
        if (isRecoveryAddress(owner, accessor)) {
            return true;
        }
        
        // Check if accessor is an emergency contact
        if (emergencyContacts[owner] == accessor) {
            return true;
        }
        
        // Check if accessor is initiator of an active recovery request
        RecoveryRequest storage request = recoveryRequests[owner];
        if (request.isActive && 
            request.initiator == accessor && 
            block.timestamp >= request.expiresAt) {
            return true;
        }
        
        return false;
    }
    
    /**
     * @dev Check if an address is a recovery address for a user
     * @param user User address
     * @param recoveryAddr Recovery address to check
     * @return True if it is a recovery address
     */
    function isRecoveryAddress(address user, address recoveryAddr) 
        public 
        view 
        returns (bool) 
    {
        address[] storage addresses = recoveryAddresses[user];
        for (uint256 i = 0; i < addresses.length; i++) {
            if (addresses[i] == recoveryAddr) {
                return true;
            }
        }
        return false;
    }
    
    /**
     * @dev Get all recovery addresses for a user
     * @param user User address
     * @return Array of recovery addresses
     */
    function getUserRecoveryAddresses(address user)
        external
        view
        returns (address[] memory)
    {
        return recoveryAddresses[user];
    }
    
    /**
     * @dev Get the emergency contact for a user
     * @param user User address
     * @return Emergency contact address
     */
    function getEmergencyContact(address user)
        external
        view
        returns (address)
    {
        return emergencyContacts[user];
    }
    
    // ===== Admin Functions =====
    
    /**
     * @dev Set the service fee
     * @param newFee New fee amount
     */
    function setServiceFee(uint256 newFee) external onlyOwner {
        uint256 previousFee = serviceFee;
        serviceFee = newFee;
        
        emit ServiceFeeChanged(previousFee, newFee);
    }
    
    /**
     * @dev Set the fee collector address
     * @param newCollector New fee collector address
     */
    function setFeeCollector(address newCollector) external onlyOwner {
        require(newCollector != address(0), "Invalid fee collector");
        feeCollector = newCollector;
    }
    
    /**
     * @dev Set blacklist status for an address
     * @param account Address to blacklist/unblacklist
     * @param isBlacklisted True to blacklist, false to unblacklist
     */
    function setBlacklistStatus(address account, bool isBlacklisted) external onlyOwner {
        blacklisted[account] = isBlacklisted;
        
        if (isBlacklisted) {
            emit SecurityAlert(
                account, 
                "BLACKLISTED", 
                block.timestamp,
                keccak256(abi.encodePacked(account, "BLACKLISTED", block.timestamp))
            );
        }
    }
    
    /**
     * @dev Set fee exemption for an address
     * @param account Address to exempt/unexempt
     * @param exempt True to exempt, false to unexempt
     */
    function setFeeExemption(address account, bool exempt) external onlyOwner {
        feeExemptions[account] = exempt;
    }
    
    /**
     * @dev Pause the contract
     */
    function pause() external onlyOwner {
        _pause();
    }
    
    /**
     * @dev Unpause the contract
     */
    function unpause() external onlyOwner {
        _unpause();
    }
    
    /**
     * @dev Reset failed attempts for an address
     * @param account Address to reset
     */
    function resetFailedAttempts(address account) external onlyOwner {
        failedAttempts[account] = 0;
    }
    
    /**
     * @dev Force cancel recovery request in case of security emergency
     * @param user User address
     */
    function emergencyCancelRecovery(address user) external onlyOwner {
        recoveryRequests[user].isActive = false;
        
        emit SecurityAlert(
            user,
            "EMERGENCY_RECOVERY_CANCEL",
            block.timestamp,
            keccak256(abi.encodePacked(user, "EMERGENCY_RECOVERY_CANCEL", block.timestamp))
        );
        
        emit RecoveryCancelled(user, msg.sender, block.timestamp);
    }
    
    /**
     * @dev Withdraw protocol fees
     * @param recipient Recipient address
     */
    function withdrawFees(address payable recipient) external onlyOwner {
        require(recipient != address(0), "Invalid recipient");
        uint256 balance = address(this).balance;
        (bool success, ) = recipient.call{value: balance}("");
        require(success, "Transfer failed");
    }
    
    // ===== Internal Functions =====
    
    /**
     * @dev Check if address is blacklisted
     * @param account Address to check
     */
    function _checkBlacklist(address account) internal view {
        require(!blacklisted[account], "Address is blacklisted");
    }
    
    /**
     * @dev Throttle requests to prevent abuse
     * @param account Address to throttle
     */
    function _throttleRequests(address account) internal {
        // Skip throttling for contract owner
        if (account == owner()) {
            return;
        }
        
        // Check if we need to reset failed attempts after cooling period
        if (block.timestamp - lastActionTimestamp[account] > 1 days) {
            failedAttempts[account] = 0;
        }
        
        // Check if account is temporarily blocked due to too many failures
        if (failedAttempts[account] >= MAX_FAILED_ATTEMPTS) {
            require(
                block.timestamp - lastActionTimestamp[account] > 1 hours,
                "Too many failed attempts, try again later"
            );
            
            // Reset counter after timeout
            failedAttempts[account] = 0;
        }
        
        // Enforce throttling between consecutive actions
        require(
            block.timestamp - lastActionTimestamp[account] >= THROTTLE_DURATION,
            "Please wait before making another request"
        );
    }   
}
