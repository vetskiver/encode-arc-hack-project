// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract GuardianVault {
    address public owner;
    address public agent;

    // --- Policy parameters ---
    uint256 public ltvBps;             // e.g. 6000 = 60%
    uint256 public minHealthBps;       // e.g. 14000 = 1.40
    uint256 public emergencyHealthBps; // e.g. 12000 = 1.20
    uint256 public liquidityMinUSDC;   // 6 decimals
    uint256 public perTxMaxUSDC;       // 6 decimals
    uint256 public dailyMaxUSDC;       // 6 decimals

    // --- Per-user state ---
    mapping(address => uint256) public collateralAmount;
    mapping(address => uint256) public debtUSDC;

    // --- Spending tracking ---
    mapping(address => uint256) public dailySpent;
    mapping(address => uint256) public dailyResetTs;

    // --- Latest oracle snapshot (set by agent before borrow) ---
    uint256 public lastOraclePrice; // 18 decimals
    uint256 public lastOracleTs;

    // --- Events ---
    event PolicySet(
        uint256 ltvBps,
        uint256 minHealthBps,
        uint256 emergencyHealthBps,
        uint256 liquidityMinUSDC,
        uint256 perTxMaxUSDC,
        uint256 dailyMaxUSDC
    );
    event CollateralRegistered(address indexed user, uint256 amount, uint256 total);
    event BorrowRecorded(address indexed user, uint256 amount, string circleTxRef, uint256 newDebt);
    event RepayRecorded(address indexed user, uint256 amount, string circleTxRef, uint256 newDebt);
    event RebalanceRecorded(string fromBucket, string toBucket, uint256 amount, string circleTxRef);
    event PaymentRecorded(address indexed user, address indexed to, uint256 amount, string circleTxRef);
    event AgentDecisionLogged(string snapshot, string action, bytes32 rationaleHash);
    event UserReset(address indexed user);
    event AgentUpdated(address indexed oldAgent, address indexed newAgent);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier onlyAgent() {
        require(msg.sender == agent, "Not agent");
        _;
    }

    modifier onlyOwnerOrAgent() {
        require(msg.sender == owner || msg.sender == agent, "Not owner or agent");
        _;
    }

    constructor(address _agent) {
        owner = msg.sender;
        agent = _agent;
        // Default policy
        ltvBps = 6000;
        minHealthBps = 14000;
        emergencyHealthBps = 12000;
        liquidityMinUSDC = 500 * 1e6;   // 500 USDC
        perTxMaxUSDC = 10000 * 1e6;     // 10,000 USDC
        dailyMaxUSDC = 50000 * 1e6;     // 50,000 USDC
    }

    // --- Admin ---

    function setAgent(address _agent) external onlyOwner {
        require(_agent != address(0), "Invalid agent");
        emit AgentUpdated(agent, _agent);
        agent = _agent;
    }

    /**
     * @notice Reset a user's collateral, debt, and spending state to zero.
     * Callable by owner OR agent so the backend can call it via API for demo resets.
     * Emits UserReset for audit trail.
     */
    function resetUser(address user) external onlyOwnerOrAgent {
        collateralAmount[user] = 0;
        debtUSDC[user] = 0;
        dailySpent[user] = 0;
        dailyResetTs[user] = 0;
        emit UserReset(user);
    }

    // --- Policy ---

    function setPolicy(
        uint256 _ltvBps,
        uint256 _minHealthBps,
        uint256 _emergencyHealthBps,
        uint256 _liquidityMinUSDC,
        uint256 _perTxMaxUSDC,
        uint256 _dailyMaxUSDC
    ) external onlyOwner {
        require(_ltvBps > 0 && _ltvBps <= 10000, "Invalid LTV");
        require(_minHealthBps > 10000, "minHealth must be > 1.0");
        require(
            _emergencyHealthBps > 10000 && _emergencyHealthBps < _minHealthBps,
            "Invalid emergencyHealth"
        );
        ltvBps = _ltvBps;
        minHealthBps = _minHealthBps;
        emergencyHealthBps = _emergencyHealthBps;
        liquidityMinUSDC = _liquidityMinUSDC;
        perTxMaxUSDC = _perTxMaxUSDC;
        dailyMaxUSDC = _dailyMaxUSDC;
        emit PolicySet(
            _ltvBps, _minHealthBps, _emergencyHealthBps,
            _liquidityMinUSDC, _perTxMaxUSDC, _dailyMaxUSDC
        );
    }

    // --- Agent actions ---

    function setOracleSnapshot(uint256 price, uint256 ts) external onlyAgent {
        require(price > 0, "Price must be > 0");
        lastOraclePrice = price;
        lastOracleTs = ts;
    }

    function registerCollateral(address user, uint256 amount) external onlyAgent {
        require(amount > 0, "Amount must be > 0");
        collateralAmount[user] += amount;
        emit CollateralRegistered(user, amount, collateralAmount[user]);
    }

    function recordBorrow(
        address user,
        uint256 amount,
        string calldata circleTxRef
    ) external onlyAgent {
        require(amount > 0, "Amount must be > 0");
        require(lastOraclePrice > 0, "No oracle snapshot");

        uint256 newDebt = debtUSDC[user] + amount;

        // collateralValueUSDC (6 dec) = collateralAmount(18) * oraclePrice(18) / 1e30
        uint256 collateralValueUSDC = (collateralAmount[user] * lastOraclePrice) / 1e30;
        uint256 maxBorrow = (collateralValueUSDC * ltvBps) / 10000;
        require(newDebt <= maxBorrow, "Exceeds LTV max borrow");

        debtUSDC[user] = newDebt;
        emit BorrowRecorded(user, amount, circleTxRef, newDebt);
    }

    function recordRepay(
        address user,
        uint256 amount,
        string calldata circleTxRef
    ) external onlyAgent {
        require(amount > 0, "Amount must be > 0");
        require(amount <= debtUSDC[user], "Repay exceeds debt");
        debtUSDC[user] -= amount;
        emit RepayRecorded(user, amount, circleTxRef, debtUSDC[user]);
    }

    function recordRebalance(
        string calldata fromBucket,
        string calldata toBucket,
        uint256 amount,
        string calldata circleTxRef
    ) external onlyAgent {
        require(amount > 0, "Amount must be > 0");
        emit RebalanceRecorded(fromBucket, toBucket, amount, circleTxRef);
    }

    function recordPayment(
        address user,
        address to,
        uint256 amount,
        string calldata circleTxRef
    ) external onlyAgent {
        require(amount > 0, "Amount must be > 0");
        require(amount <= perTxMaxUSDC, "Exceeds per-tx max");

        // Daily spending cap
        if (block.timestamp > dailyResetTs[user] + 1 days) {
            dailySpent[user] = 0;
            dailyResetTs[user] = block.timestamp;
        }
        require(dailySpent[user] + amount <= dailyMaxUSDC, "Exceeds daily max");
        dailySpent[user] += amount;

        emit PaymentRecorded(user, to, amount, circleTxRef);
    }

    function logDecision(
        string calldata snapshot,
        string calldata action,
        bytes32 rationaleHash
    ) external onlyAgent {
        emit AgentDecisionLogged(snapshot, action, rationaleHash);
    }

    // --- View helpers ---

    function getUserState(address user)
        external
        view
        returns (
            uint256 _collateral,
            uint256 _debt,
            uint256 _dailySpent,
            uint256 _dailyResetTs
        )
    {
        return (
            collateralAmount[user],
            debtUSDC[user],
            dailySpent[user],
            dailyResetTs[user]
        );
    }

    function getPolicy()
        external
        view
        returns (uint256, uint256, uint256, uint256, uint256, uint256)
    {
        return (
            ltvBps,
            minHealthBps,
            emergencyHealthBps,
            liquidityMinUSDC,
            perTxMaxUSDC,
            dailyMaxUSDC
        );
    }
}
