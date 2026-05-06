// Aetheria — admin tool types.

export interface BanInput {
  readonly actorUserId: bigint;
  readonly targetUserId: bigint;
  readonly reason: string;
  readonly ip?: string | null;
  readonly userAgent?: string | null;
}

export interface UnbanInput {
  readonly actorUserId: bigint;
  readonly targetUserId: bigint;
  readonly ip?: string | null;
  readonly userAgent?: string | null;
}

export interface GrantItemInput {
  readonly actorUserId: bigint;
  readonly targetUserId: bigint;
  readonly itemId: bigint;
  readonly quantity: number;
  readonly ip?: string | null;
  readonly userAgent?: string | null;
}

export interface FeatureFlagSetInput {
  readonly actorUserId: bigint;
  readonly key: string;
  readonly value: unknown;
}

export interface FeatureFlagRow {
  readonly key: string;
  readonly value: unknown;
  readonly updatedBy: string | null;
  readonly updatedAt: Date;
}

export interface AuditEntry {
  readonly id: bigint;
  readonly actorUserId: bigint | null;
  readonly action: string;
  readonly targetType: string;
  readonly targetId: bigint | null;
  readonly payload: unknown;
  readonly ip: string | null;
  readonly userAgent: string | null;
  readonly createdAt: Date;
}

export interface ReplayQuery {
  readonly action?: string;
  readonly actorUserId?: bigint;
  readonly targetType?: string;
  readonly limit?: number;
  readonly before?: Date;
}
