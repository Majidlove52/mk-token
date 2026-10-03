// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {VestingWalletCliff} from "@openzeppelin/contracts/finance/VestingWalletCliff.sol";
import {VestingWallet} from "@openzeppelin/contracts/finance/VestingWallet.sol";

contract MKATeamVesting is VestingWalletCliff {
    uint64 public constant CLIFF = 365 days;
    uint64 public constant DURATION = 3 * 365 days;

    constructor(address beneficiary, uint64 startTimestamp)
        VestingWallet(beneficiary, startTimestamp, DURATION)
        VestingWalletCliff(CLIFF)
    {}
}