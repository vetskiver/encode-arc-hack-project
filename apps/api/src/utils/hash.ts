import { ethers } from "ethers";

export function rationaleHash(rationale: string): string {
  return ethers.keccak256(ethers.toUtf8Bytes(rationale));
}
