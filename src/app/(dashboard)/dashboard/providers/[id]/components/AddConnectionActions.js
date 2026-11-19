"use client";

import PropTypes from "prop-types";
import { Button } from "@/shared/components";
import { translate } from "@/i18n/runtime";
import WebLoginButton, { WEB_LOGIN_PROVIDERS } from "../../components/WebLoginButton.js";
import MinimaxLeaseButton from "../../components/MinimaxLeaseButton.js";
import { MCODE_LEASE_PROVIDERS } from "../utils/providerMeta";

/**
 * Shared add-connection action buttons rendered in both empty state and bottom footer.
 */
export default function AddConnectionActions({
  providerId,
  isCompatible,
  hasDualAuthModes,
  oauthConnectionLabel,
  apiKeyConnectionLabel,
  isEmptyState,
  onRefresh,
  onTriggerOAuth,
  onTriggerApiKey,
  onTriggerAdd,
  onOpenIFlowCookie,
  onOpenBulkCodex,
  onOpenBulkGrokCli,
  onOpenBulkAntigravity,
}) {
  const buttonClass = isEmptyState ? undefined : "w-full sm:w-auto";

  if (hasDualAuthModes) {
    return (
      <>
        <Button size="sm" icon="lock" variant="secondary" onClick={onTriggerOAuth} className={buttonClass}>
          {oauthConnectionLabel}
        </Button>
        <Button size="sm" icon="key" onClick={onTriggerApiKey} className={buttonClass}>
          {apiKeyConnectionLabel}
        </Button>
      </>
    );
  }

  const primaryLabel = isEmptyState
    ? isCompatible
      ? "Add API Key"
      : providerId === "iflow"
        ? "OAuth"
        : "Add Connection"
    : "Add";

  return (
    <>
      {!isCompatible && WEB_LOGIN_PROVIDERS.has(providerId) && (
        <WebLoginButton providerId={providerId} onConnected={onRefresh} />
      )}
      {!isCompatible && MCODE_LEASE_PROVIDERS.has(providerId) && (
        <MinimaxLeaseButton providerId={providerId} onConnected={onRefresh} />
      )}
      {!isCompatible && providerId === "iflow" && (
        <Button
          size="sm"
          icon="cookie"
          variant="secondary"
          onClick={onOpenIFlowCookie}
          title={isEmptyState ? undefined : "Add connection using browser cookie"}
          className={buttonClass}
        >
          Cookie
        </Button>
      )}
      {!isCompatible && providerId === "codex" && (
        <Button
          size="sm"
          icon="playlist_add"
          variant="secondary"
          onClick={onOpenBulkCodex}
          title={isEmptyState ? undefined : translate("Bulk import codex accounts from JSON")}
          className={buttonClass}
        >
          {translate("Bulk Add")}
        </Button>
      )}
      {!isCompatible && providerId === "grok-cli" && (
        <Button
          size="sm"
          icon="playlist_add"
          variant="secondary"
          onClick={onOpenBulkGrokCli}
          title={isEmptyState ? undefined : translate("Bulk import Grok CLI accounts from JSON")}
          className={buttonClass}
        >
          {translate("Bulk Add")}
        </Button>
      )}
      {!isCompatible && isEmptyState && providerId === "antigravity" && (
        <Button size="sm" icon="playlist_add" variant="secondary" onClick={onOpenBulkAntigravity}>
          {translate("Bulk Add")}
        </Button>
      )}
      <Button size="sm" icon="add" onClick={onTriggerAdd} className={buttonClass}>
        {primaryLabel}
      </Button>
    </>
  );
}

AddConnectionActions.propTypes = {
  providerId: PropTypes.string.isRequired,
  isCompatible: PropTypes.bool.isRequired,
  hasDualAuthModes: PropTypes.bool.isRequired,
  oauthConnectionLabel: PropTypes.string.isRequired,
  apiKeyConnectionLabel: PropTypes.string.isRequired,
  isEmptyState: PropTypes.bool.isRequired,
  onRefresh: PropTypes.func.isRequired,
  onTriggerOAuth: PropTypes.func.isRequired,
  onTriggerApiKey: PropTypes.func.isRequired,
  onTriggerAdd: PropTypes.func.isRequired,
  onOpenIFlowCookie: PropTypes.func.isRequired,
  onOpenBulkCodex: PropTypes.func.isRequired,
  onOpenBulkGrokCli: PropTypes.func.isRequired,
  onOpenBulkAntigravity: PropTypes.func.isRequired,
};
