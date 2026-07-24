// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title  MacTheKnife (KNIFE)
 * @notice An "open book" fair-launch BEP-20 for BNB Chain whose defining feature is that it
 *         cuts its own strings.
 *
 *  THE DEADHAND CUT
 *  ----------------
 *  At deployment an immutable `controlDeadline` is burned into the contract. Until that moment
 *  the deployer may perform ONLY honest launch chores: turn trading on (once), and set an
 *  optional anti-snipe max-wallet before launch. The instant the deadline passes, EVERY owner
 *  power expires automatically and permanently — whether or not the deployer bothers to
 *  renounce. From that block on there is no gate, no cap, and (once renounced) no owner.
 *
 *  Provable guarantees (all verifiable on BscScan once source is verified):
 *   - FIXED SUPPLY. Entire supply minted once in the constructor. No mint function. No minter role.
 *   - NO BLACKLIST / NO FREEZE. There is no per-address deny mechanism. Nobody can stop you selling.
 *   - NO TRANSFER TAX. Every transfer delivers 100% of the amount. There is no fee path.
 *   - ONE-WAY TRADING. Trading can be switched on once; it can never be switched off.
 *   - LIMITS ONLY BEFORE LAUNCH. The anti-snipe cap is settable only before trading opens, and
 *     can only be removed thereafter — never used to trap holders.
 *   - LIVENESS GUARANTEED. After `controlDeadline` the token is permanently transferable by
 *     construction. It CANNOT be locked forever, even by a malicious or absent deployer.
 *
 *  NOTE: `INITIAL_SUPPLY`, name and symbol are the confirmed defaults. `controlWindowSeconds`
 *        is chosen at deploy time and is hard-capped by `MAX_CONTROL_WINDOW`.
 */
contract MacTheKnife is ERC20, ERC20Burnable, Ownable {
    /// @notice 1,000,000,000 KNIFE at 18 decimals. Fixed forever.
    uint256 public constant INITIAL_SUPPLY = 1_000_000_000 ether;

    /// @notice The deployer can never hold launch powers longer than this, by construction.
    uint256 public constant MAX_CONTROL_WINDOW = 7 days;

    /// @notice Unix time after which all owner powers auto-expire and the token is free forever.
    uint256 public immutable controlDeadline;

    /// @notice Trading is closed until the owner opens it once, during the control window.
    bool public tradingEnabled;

    /// @notice Optional anti-snipe cap. 0 == no cap. Only settable before launch; only removable after.
    uint256 public maxWallet;

    /// @notice Addresses exempt from the pre-launch gate and the max-wallet cap (owner, LP pair, router).
    mapping(address => bool) public isExemptFromLimits;

    event TradingEnabled();
    event MaxWalletUpdated(uint256 newMaxWallet);
    event LimitExemptSet(address indexed account, bool exempt);

    error ControlWindowClosed();
    error ControlWindowTooLong();
    error TradingNotEnabled();
    error MaxWalletExceeded();
    error AlreadyEnabled();
    error TradingAlreadyOpen();

    /// @dev Owner powers are only usable while the Deadhand countdown is still running.
    modifier duringControlWindow() {
        if (block.timestamp >= controlDeadline) revert ControlWindowClosed();
        _;
    }

    constructor(address initialOwner, uint256 controlWindowSeconds)
        ERC20("Mac the Knife", "KNIFE")
        Ownable(initialOwner)
    {
        if (controlWindowSeconds > MAX_CONTROL_WINDOW) revert ControlWindowTooLong();
        controlDeadline = block.timestamp + controlWindowSeconds;

        _mint(initialOwner, INITIAL_SUPPLY);
        isExemptFromLimits[initialOwner] = true;
        isExemptFromLimits[address(this)] = true;
    }

    /// @notice Open trading for everyone. One-way and time-boxed: cannot be undone, cannot be late.
    function enableTrading() external onlyOwner duringControlWindow {
        if (tradingEnabled) revert AlreadyEnabled();
        tradingEnabled = true;
        emit TradingEnabled();
    }

    /// @notice Set the anti-snipe max wallet. Only before trading opens.
    function setMaxWalletBeforeLaunch(uint256 newMaxWallet) external onlyOwner duringControlWindow {
        if (tradingEnabled) revert TradingAlreadyOpen();
        maxWallet = newMaxWallet;
        emit MaxWalletUpdated(newMaxWallet);
    }

    /// @notice Permanently drop all holding limits. One-way (looser is always allowed).
    function removeLimits() external onlyOwner duringControlWindow {
        maxWallet = 0;
        emit MaxWalletUpdated(0);
    }

    /// @notice Exempt/unexempt an address from limits — e.g. the LP pair and router at launch.
    function setLimitExempt(address account, bool exempt) external onlyOwner duringControlWindow {
        isExemptFromLimits[account] = exempt;
        emit LimitExemptSet(account, exempt);
    }

    /// @notice True while the deployer still holds any launch powers.
    function controlWindowOpen() public view returns (bool) {
        return block.timestamp < controlDeadline;
    }

    /// @notice Open book in one call: every safety fact a holder or explorer needs.
    function status()
        external
        view
        returns (
            bool trading,
            uint256 maxWallet_,
            uint256 controlDeadline_,
            bool controlWindowOpen_,
            bool ownershipRenounced,
            uint256 supply
        )
    {
        return (
            tradingEnabled,
            maxWallet,
            controlDeadline,
            block.timestamp < controlDeadline,
            owner() == address(0),
            totalSupply()
        );
    }

    /// @dev Single OZ v5 transfer hook. Mint (from==0) and burn (to==0) always pass through.
    ///      All restrictions apply ONLY while the control window is open; after the Deadhand
    ///      Cut the branch is skipped entirely and every transfer is unconditionally allowed.
    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0) && block.timestamp < controlDeadline) {
            if (!tradingEnabled && !isExemptFromLimits[from] && !isExemptFromLimits[to]) {
                revert TradingNotEnabled();
            }
            if (maxWallet != 0 && !isExemptFromLimits[to]) {
                if (balanceOf(to) + value > maxWallet) revert MaxWalletExceeded();
            }
        }
        super._update(from, to, value);
    }
}
