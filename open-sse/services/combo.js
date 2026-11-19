/**
 * Facade / barrel file for combo routing, capabilities, failover, and fusion
 */

export {
  HARD_CAPS,
  reorderByCapabilities,
  detectRequiredCapabilities,
  trailingUserItems,
} from "./combo/capabilities.js";

export {
  comboRotationState,
  getRotatedModels,
  resetComboRotation,
  getComboModelsFromData,
} from "./combo/rotation.js";

export {
  flattenToolHistory,
  extractPanelText,
  buildJudgePrompt,
  collectPanel,
  handleFusionChat,
  FUSION_DEFAULTS,
} from "./combo/fusion.js";

export {
  peekComboResponse,
  isZeroContentResponse,
  handleComboChat,
} from "./combo/failover.js";

export {
  getStickyComboModel,
  setStickyComboModel,
  clearStickyComboSession,
  orderModelsByChoice,
} from "./systemoneRouter.js";
