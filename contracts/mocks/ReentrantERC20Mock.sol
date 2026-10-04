// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract ReentrantERC20Mock is ERC20 {
    address public stakingContract;
    bool public attemptedReentry;
    bool public reentrySucceeded;

    constructor() ERC20("MKA Reentrancy Test", "MKA-TEST") {
        _mint(msg.sender, 10_000 * 10 ** 18);
    }

    function setStakingContract(address staking) external {
        stakingContract = staking;
    }

    function transferFrom(address from, address to, uint256 value)
        public
        override
        returns (bool)
    {
        bool transferred = super.transferFrom(from, to, value);
        attemptedReentry = true;
        (reentrySucceeded, ) = stakingContract.call(
            abi.encodeWithSignature("stake(uint256)", value)
        );
        return transferred;
    }
}