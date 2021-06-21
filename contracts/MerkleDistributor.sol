// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.7.3;

import "@openzeppelin/contracts/cryptography/MerkleProof.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interfaces/IMerkleDistributor.sol";

contract MerkleDistributor is IMerkleDistributor {
    using SafeMath for uint256;

    bytes32 public override merkleRoot;

    // Mapping of account to token to the cumulative points used to claim that token.
    mapping(address => mapping(address => uint256)) claimed;

    constructor(bytes32 _merkleRoot) {
        merkleRoot = _merkleRoot;
    }

    function claim(
        address _token,
        uint256 _accountPoints,
        uint256 _aggregatePoints,
        bytes32[] calldata _accountMerkleProof,
        bytes32[] calldata _aggregateMerkleProof
    ) external override {
        // Verify the account's merkle proof.
        bytes32 accountNode = keccak256(abi.encodePacked(msg.sender, _accountPoints));
        require(MerkleProof.verify(_accountMerkleProof, merkleRoot, accountNode), "MerkleDistributor: Invalid account proof.");

        // Verify the aggregate's merkle proof.
        bytes32 aggregateNode = keccak256(abi.encodePacked(address(0), _aggregatePoints));
        require(MerkleProof.verify(_aggregateMerkleProof, merkleRoot, aggregateNode), "MerkleDistributor: Invalid aggregate proof.");

        // Subtract what's already been claimed from the account's cumulative points.
        uint256 accountClaimable = _accountPoints.sub(claimed[msg.sender][_token], "MerkleDistributor: Excessive account points.");

        // Subtract what's already been claimed from the aggregate's cumulative points.
        uint256 aggregateClaimable = _aggregatePoints.sub(claimed[address(0)][_token], "MerkleDistributor: Excessive aggregate points.");

        // Verify whether all points have been claimed.
        require(accountClaimable > 0 && aggregateClaimable > 0, "MerkleDistributor: Nothing to claim.");

        // Percent of the operator's balance to claim.
        uint256 percentClaimable = accountClaimable.mul(1e18).div(aggregateClaimable);

        // Emit the event for RenVM to pick up.
        emit Claimed(msg.sender, _token, percentClaimable);

        // Mark it claimed.
        claimed[msg.sender][_token] = claimed[msg.sender][_token].add(accountClaimable);
        claimed[address(0)][_token] = claimed[address(0)][_token].add(accountClaimable);
    }

    function getClaimed(address _account, address _token) external view override returns (uint256) {
        return claimed[_account][_token];
    }

    function updateMerkleRoot(bytes32 _merkleRoot) external override {
        merkleRoot = _merkleRoot;
    }
}
