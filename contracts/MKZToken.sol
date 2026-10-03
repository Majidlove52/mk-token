// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";

contract MKZToken is ERC20, ERC20Burnable {
    uint256 public constant TOTAL_SUPPLY = 1_000_000_000 * 10 ** 18;

    constructor(address treasury) ERC20("MK Zone Token", "MKZ") {
        require(treasury != address(0), "MKZ: treasury is zero address");
        _mint(treasury, TOTAL_SUPPLY);
    }
}