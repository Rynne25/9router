import { NextResponse } from "next/server";
import { getProviderConnections, getProviderConnectionById, updateProviderConnection } from "../../../../../models/index.js";
import { warmupAccount } from "../../../../../lib/antigravity/accountService.js";

/**
 * POST /api/oauth/antigravity/warmup
 * Triggers warmup for a single connection or all connections.
 *
 * Body: { connectionId?: string, all?: boolean }
 */
export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const connectionId = body?.connectionId || body?.id || null;
    const isAll = body?.all === true || !connectionId;

    if (connectionId && !isAll) {
      const connection = await getProviderConnectionById(connectionId);
      if (!connection) {
        return NextResponse.json(
          { error: `Connection ${connectionId} not found` },
          { status: 404 }
        );
      }
      if (connection.provider !== "antigravity") {
        return NextResponse.json(
          { error: `Connection is not an Antigravity provider (${connection.provider})` },
          { status: 400 }
        );
      }

      const result = await warmupAccount(connection);
      if (result.ok) {
        await updateProviderConnection(connection.id, {
          testStatus: "active",
          lastError: null,
          providerSpecificData: {
            ...(connection.providerSpecificData || {}),
            validationBlocked: false,
            isValidationBlocked: false,
            validationReason: null,
            validationUrl: null,
            appealUrl: null,
            lastWarmupAt: new Date().toISOString(),
          },
        }).catch(() => {});
      } else {
        const isVerif = Boolean(
          result.verification?.isVerificationRequired ||
          (typeof result.error === "string" && (result.error.includes("403") || /verify\s+your\s+account/i.test(result.error)))
        );
        await updateProviderConnection(connection.id, {
          testStatus: "error",
          lastError: result.error || "Warmup failed",
          lastErrorAt: new Date().toISOString(),
          providerSpecificData: {
            ...(connection.providerSpecificData || {}),
            validationBlocked: isVerif,
            isValidationBlocked: isVerif,
            validationReason: result.verification?.message || (isVerif ? "Verify your account to continue." : null),
            validationUrl: result.verification?.validationUrl || null,
            appealUrl: result.verification?.appealUrl || null,
            lastVerificationDetectedAt: isVerif ? new Date().toISOString() : connection.providerSpecificData?.lastVerificationDetectedAt,
          },
        }).catch(() => {});
      }
      return NextResponse.json({
        success: result.ok,
        connectionId: connection.id,
        email: connection.email,
        result,
      });
    }

    // Warmup all Antigravity connections
    const connections = await getProviderConnections({ provider: "antigravity" });
    if (connections.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No Antigravity connections configured to warm up",
        results: [],
      });
    }

    const BATCH_SIZE = 5;
    const results = [];
    for (let i = 0; i < connections.length; i += BATCH_SIZE) {
      const batch = connections.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map(async (conn) => {
          try {
            const res = await warmupAccount(conn);
            if (res.ok) {
              await updateProviderConnection(conn.id, {
                testStatus: "active",
                lastError: null,
                providerSpecificData: {
                  ...(conn.providerSpecificData || {}),
                  validationBlocked: false,
                  isValidationBlocked: false,
                  validationReason: null,
                  validationUrl: null,
                  appealUrl: null,
                  lastWarmupAt: new Date().toISOString(),
                },
              }).catch(() => {});
            } else {
              const isVerif = Boolean(
                res.verification?.isVerificationRequired ||
                (typeof res.error === "string" && (res.error.includes("403") || /verify\s+your\s+account/i.test(res.error)))
              );
              await updateProviderConnection(conn.id, {
                testStatus: "error",
                lastError: res.error || "Warmup failed",
                lastErrorAt: new Date().toISOString(),
                providerSpecificData: {
                  ...(conn.providerSpecificData || {}),
                  validationBlocked: isVerif,
                  isValidationBlocked: isVerif,
                  validationReason: res.verification?.message || (isVerif ? "Verify your account to continue." : null),
                  validationUrl: res.verification?.validationUrl || null,
                  appealUrl: res.verification?.appealUrl || null,
                  lastVerificationDetectedAt: isVerif ? new Date().toISOString() : conn.providerSpecificData?.lastVerificationDetectedAt,
                },
              }).catch(() => {});
            }
            return {
              connectionId: conn.id,
              email: conn.email,
              ok: res.ok,
              model: res.model,
              activated: res.activated,
              text: res.text,
              error: res.error || null,
              verification: res.verification || null,
            };
          } catch (err) {
            return {
              connectionId: conn.id,
              email: conn.email,
              ok: false,
              activated: false,
              error: err.message,
            };
          }
        })
      );
      results.push(...batchResults);
    }

    const activatedCount = results.filter((r) => r.ok && r.activated).length;

    return NextResponse.json({
      success: true,
      message: `Làm nóng hoàn tất: ${activatedCount}/${connections.length} tài khoản thành công!`,
      total: connections.length,
      activatedCount,
      results,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "Failed to trigger warmup" },
      { status: 500 }
    );
  }
}
