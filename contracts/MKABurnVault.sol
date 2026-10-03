// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title MKABurnVault
 * @notice Public vault for permanently burning MKA sent to the vault address.
 */
contract MKABurnVault is ReentrancyGuard {
    /// @notice MKA token whose vault balance may be burned.
    ERC20Burnable public immutable mkaToken;
    /// @notice Cumulative MKA burned through this vault.
    uint256 public totalBurnedByVault;

    /// @notice Emitted when a caller burns the vault's pending MKA.
    event Burned(address indexed caller, uint256 amount);

    /**
     * @notice Creates a vault for an MKA ERC-20 burnable token.
     * @param tokenAddress Address of the MKA ERC-20 contract.
     */
    constructor(address tokenAddress) {
        require(tokenAddress != address(0), "MKABurnVault: token is zero address");
        mkaToken = ERC20Burnable(tokenAddress);
    }

    /**
     * @notice Burns the vault's entire token balance; anyone may trigger this operation.
     * @dev MKA must be transferred to the vault before this function is called.
     */
    function burnAll() external nonReentrant {
        uint256 amount = pendingBurn();
        require(amount > 0, "MKABurnVault: no tokens to burn");

        totalBurnedByVault += amount;
        mkaToken.burn(amount);

        emit Burned(msg.sender, amount);
    }

    /**
     * @notice Returns the current MKA balance held by this vault awaiting a burn.
     * @return amount Pending MKA in token base units.
     */
    function pendingBurn() public view returns (uint256 amount) {
        return mkaToken.balanceOf(address(this));
    }
}