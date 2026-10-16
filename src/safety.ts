/**
 * Safety fields per provider endpoint. A field goes out only where that endpoint's schema lists it:
 * unknown fields may be refused with a 422. Sources (checked 2026-10-16):
 * - fal API pages. `enable_safety_checker` (disabling needs account authorization, otherwise the request is
 *   still checked): seedream v5 pro, flux-2-pro, gpt-image-2.5 flare/sunburst, grok-imagine-image v2.0, wan v2.7.
 *   `safety_tolerance` (string "1".."6", 6 = least strict): nano-banana-2, google/nano-banana-2.1, nano-banana-pro;
 *   flux-2-pro has both, its scale is 1..5. meta/muse-image has no safety field at all.
 * - kie docs (docs.kie.ai/market/...): `nsfw_checker` on qwen2-1, seedream 5-pro, flux-2 pro, grok-imagine,
 *   wan 2.7 image. None on nano-banana-2 / 2-1 / pro or gpt-image-2-5.
 * Provider-side model filters (Google's own, fal's content checker on Muse) are not controlled by any field.
 */

/** Extra input fields for a fal endpoint that relax its safety checking. */
export function falSafetyFields(endpoint: string): Record<string, unknown> {
  if (endpoint.startsWith("fal-ai/nano-banana") || endpoint.startsWith("google/nano-banana")) {
    return { safety_tolerance: "6" };
  }
  if (endpoint.startsWith("fal-ai/flux-2-pro")) {
    return { safety_tolerance: "5", enable_safety_checker: false };
  }
  if (
    endpoint.startsWith("bytedance/seedream/") ||
    endpoint.startsWith("openai/gpt-image-2.5/") ||
    endpoint.startsWith("xai/grok-imagine-image/") ||
    endpoint.startsWith("fal-ai/wan/")
  ) {
    return { enable_safety_checker: false };
  }
  return {};
}

/** fal `enable_prompt_expansion` exists only on Wan 2.7 edit (default true, "supported only for image edit mode"). */
export function falHasPromptExpansion(endpoint: string): boolean {
  return endpoint === "fal-ai/wan/v2.7/edit";
}

/** kie models whose input has an `nsfw_checker` flag. */
export function kieHasNsfwChecker(kieModel: string): boolean {
  return (
    kieModel.startsWith("qwen2-1/") ||
    kieModel.startsWith("seedream/") ||
    kieModel.startsWith("flux-2/") ||
    kieModel.startsWith("grok-imagine/") ||
    kieModel.startsWith("wan/")
  );
}
