// ──────────────────────────────────────────────────────────────────────────
// Single dispatch point for "call this model" — picks the right gateway
// (api.17.wtf vs the original iamhc gateway) based on config/models.js's
// MODEL_PROVIDER map, so callers (aiRouterService, vision.js, ...) never
// need to know or care which provider a given model lives on.
// ──────────────────────────────────────────────────────────────────────────
import { chatCompletion as iamhcChatCompletion } from "../providers/iamhcProvider.js";
import { chatCompletion as api17ChatCompletion } from "../providers/api17Provider.js";
import { getProviderForModel } from "../config/models.js";

/**
 * Same signature/return shape as the individual provider chatCompletion()
 * functions — { ok, content, status, error, broken }. `apiKey` (an
 * optional override) only applies to the iamhc gateway; api17 always uses
 * its own dedicated API17_API_KEY secret.
 */
export async function routedChatCompletion({ model, apiKey, ...rest }) {
  const provider = getProviderForModel(model);
  if (provider === "api17") {
    return api17ChatCompletion({ model, ...rest });
  }
  return iamhcChatCompletion({ model, apiKey, ...rest });
}

export default { routedChatCompletion };
