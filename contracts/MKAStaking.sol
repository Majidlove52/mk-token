// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title MKAStaking
 * @notice Holds MKA solely to determine access tiers. It has no rewards or administrator.
 */
contract MKAStaking is ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice MKA token accepted by this contract.
    IERC20 public immutable mkaToken;
    /// @notice Minimum staked amount for tier 1, denominated in token base units.
    uint256 public immutable tier1Threshold;
    /// @notice Minimum staked amount for tier 2, denominated in token base units.
    uint256 public immutable tier2Threshold;
    /// @notice Minimum staked amount for tier 3, denominated in token base units.
    uint256 public immutable tier3Threshold;
    /// @notice Minimum time after a user's most recent stake before unstaking.
    uint256 public constant UNLOCK_DELAY = 7 days;

    /// @notice MKA staked by each account.
    mapping(address account => uint256 amount) public stakes;
    /// @notice Timestamp of each account's most recent stake.
    mapping(address account => uint256 timestamp) public lastStakeTimestamp;
    /// @notice Aggregate MKA held for access staking.
    uint256 public totalStaked;

    /// @notice Emitted after an account stakes MKA.
    event Staked(address indexed user, uint256 amount);
    /// @notice Emitted after an account unstakes MKA.
    event Unstaked(address indexed user, uint256 amount);

    /**
     * @notice Initializes the immutable token and access tier thresholds.
     * @param mkaTokenAddress Address of the MKA ERC-20 token.
     * @param tier1 Minimum tier 1 balance in MKA base units.
     * @param tier2 Minimum tier 2 balance in MKA base units.
     * @param tier3 Minimum tier 3 balance in MKA base units.
     */
    constructor(address mkaTokenAddress, uint256 tier1, uint256 tier2, uint256 tier3) {
        require(mkaTokenAddress != address(0), "MKAStaking: token is zero address");
        require(
            tier1 > 0 && tier2 > tier1 && tier3 > tier2,
            "MKAStaking: invalid tier thresholds"
        );

        mkaToken = IERC20(mkaTokenAddress);
        tier1Threshold = tier1;
        tier2Threshold = tier2;
        tier3Threshold = tier3;
    }

    /**
     * @notice Stakes MKA for access-tier qualification and starts or resets the lock.
     * @param amount Amount of MKA to stake; must be greater than zero.
     */
    function stake(uint256 amount) external nonReentrant {
        require(amount > 0, "MKAStaking: zero amount");

        stakes[msg.sender] += amount;
        totalStaked += amount;
        lastStakeTimestamp[msg.sender] = block.timestamp;

        mkaToken.safeTransferFrom(msg.sender, address(this), amount);
        emit Staked(msg.sender, amount);
    }

    /**
     * @notice Returns staked MKA to the caller after the latest stake has been locked for seven days.
     * @param amount Amount of MKA to return; must be greater than zero and no more than the caller's stake.
     */
    function unstake(uint256 amount) external nonReentrant {
        require(amount > 0, "MKAStaking: zero amount");
        require(amount <= stakes[msg.sender], "MKAStaking: insufficient staked balance");
        require(
            block.timestamp >= lastStakeTimestamp[msg.sender] + UNLOCK_DELAY,
            "MKAStaking: stake is locked"
        );

        stakes[msg.sender] -= amount;
        totalStaked -= amount;
        if (stakes[msg.sender] == 0) {
            lastStakeTimestamp[msg.sender] = 0;
        }

        mkaToken.safeTransfer(msg.sender, amount);
        emit Unstaked(msg.sender, amount);
    }

    /**
     * @notice Returns the access tier for an account's current staked balance.
     * @param user Account to inspect.
     * @return tier 0 when below tier 1, otherwise tier 1, 2, or 3.
     */
    function tierOf(address user) external view returns (uint8 tier) {
        uint256 amount = stakes[user];
        if (amount >= tier3Threshold) return 3;
        if (amount >= tier2Threshold) return 2;
        if (amount >= tier1Threshold) return 1;
        return 0;
    }

    /**
     * @notice Returns the amount of MKA staked by an account.
     * @param user Account to inspect.
     * @return amount Staked MKA in token base units.
     */
    function stakedBalance(address user) external view returns (uint256 amount) {
        return stakes[user];
    }
}