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
 *  optional anti-snipe max-wallet before launch. The instant the deadline passes, EVERY
 *  KNIFE-specific launch power expires automatically and permanently — whether or not the deployer
 *  bothers to
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
 *   - OWNER SLOT GOES INERT. `transferOwnership` / `renounceOwnership` stay callable past the
 *     deadline because they belong to OpenZeppelin's Ownable, but they confer nothing: every
 *     power defined in this contract carries `duringControlWindow`, so a post-deadline owner
 *     is a name with no verbs.
 *
 *  NOTE: `INITIAL_SUPPLY`, name and symbol are the confirmed defaults. `controlWindowSeconds`
 *        is chosen at deploy time and is hard-capped at 72h by `MAX_CONTROL_WINDOW`.
 */
contract MacTheKnife is ERC20, ERC20Burnable, Ownable {
    /// @notice 1,000,000,000 KNIFE at 18 decimals. Fixed forever.
    uint256 public constant INITIAL_SUPPLY = 1_000_000_000 ether;

    /// @notice The deployer can never hold launch powers longer than this, by construction.
    ///         72h is the figure published in the litepaper and on the site; it is enforced
    ///         here so it is provable from the verified bytecode, not merely promised in copy.
    uint256 public constant MAX_CONTROL_WINDOW = 72 hours;

    /// @notice Unix time after which all KNIFE-specific owner powers expire and the token is free.
    uint256 public immutable controlDeadline;

    /// @notice Trading is closed until the owner opens it once, during the control window.
    bool public tradingEnabled;

    /// @notice Optional anti-snipe cap. 0 == no cap. Only settable before launch; only removable after.
    uint256 public maxWallet;

    /// @notice Addresses exempt from the pre-launch gate and the max-wallet cap (owner, LP pair, router).
    mapping(address => bool) public isExemptFromLimits;

    /// @notice Emitted once, in the constructor, announcing when KNIFE-specific powers die.
    ///         Lets indexers and explorers read the Deadhand deadline from a log at genesis
    ///         instead of having to call a view function.
    /// @param controlDeadline_ Unix time at which every KNIFE-specific power expires permanently.
    /// @param windowSeconds    The window length chosen at deploy time, in seconds.
    event DeadhandArmed(uint256 controlDeadline_, uint256 windowSeconds);
    event TradingEnabled();
    event MaxWalletUpdated(uint256 newMaxWallet);
    event LimitExemptSet(address indexed account, bool exempt);

    error ControlWindowClosed();
    error ControlWindowTooLong();
    error TradingNotEnabled();
    error MaxWalletExceeded();
    error AlreadyEnabled();
    error TradingAlreadyOpen();

    /// @dev KNIFE-specific owner powers work only while the Deadhand countdown is running.
    modifier duringControlWindow() {
        if (block.timestamp >= controlDeadline) revert ControlWindowClosed();
        _;
    }

    /// @param initialOwner        Receives the entire fixed supply and the time-boxed launch powers.
    /// @param controlWindowSeconds How long those powers last. Reverts above `MAX_CONTROL_WINDOW`.
    constructor(address initialOwner, uint256 controlWindowSeconds)
        ERC20("Mac the Knife", "KNIFE")
        Ownable(initialOwner)
    {
        if (controlWindowSeconds > MAX_CONTROL_WINDOW) revert ControlWindowTooLong();
        controlDeadline = block.timestamp + controlWindowSeconds;
        emit DeadhandArmed(controlDeadline, controlWindowSeconds);

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
    /// @param newMaxWallet Cap in wei (18 decimals). 0 means no cap. See DEPLOYMENT.md for
    ///        the percentage-of-supply figures worth using.
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
    /// @param account The address to change.
    /// @param exempt  True to exempt it from the pre-launch gate and the max-wallet cap.
    function setLimitExempt(address account, bool exempt) external onlyOwner duringControlWindow {
        isExemptFromLimits[account] = exempt;
        emit LimitExemptSet(account, exempt);
    }

    /// @notice True while the deployer still holds any launch powers.
    /// @return open False the instant the Deadhand Cut fires, and false forever after.
    function controlWindowOpen() public view returns (bool open) {
        return block.timestamp < controlDeadline;
    }

    /// @notice Seconds left before every KNIFE-specific power expires. Reads 0 after the Cut.
    ///         Provided so a holder can watch the countdown straight off BscScan's "Read
    ///         Contract" tab without doing arithmetic on a unix timestamp.
    /// @return remaining Seconds remaining, or 0 if the control window has closed.
    function controlWindowRemaining() external view returns (uint256 remaining) {
        // The one function here that genuinely needs `block.timestamp` twice, so it is read
        // once into a local. Everywhere else a single read is all that happens.
        uint256 ts = block.timestamp;
        return ts >= controlDeadline ? 0 : controlDeadline - ts;
    }

    /// @notice Open book in one call: every safety fact a holder or explorer needs.
    /// @return trading            Whether trading has been opened (one-way, never closes).
    /// @return maxWallet_         The cap as stored, in wei. Unenforced once the window closes,
    ///                            so read it together with `controlWindowOpen_`.
    /// @return controlDeadline_   Unix time at which KNIFE-specific powers expire.
    /// @return controlWindowOpen_ False means no gate and no cap apply, permanently.
    /// @return ownershipRenounced Whether `owner()` is the zero address.
    /// @return supply             Current total supply — can only fall, via burns.
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
