"use client";

import { Button, Input, Modal } from "@/shared/components";

export const RELAY_PROVIDERS = {
  vercel: {
    id: "vercel",
    name: "Vercel",
    modalTitle: "Deploy Vercel Relay",
    endpoint: "/api/proxy-pools/vercel-deploy",
    deployButtonText: "Deploy",
    deployingButtonText: "Deploying... (may take ~1 min)",
    boxClassName: "rounded-lg bg-blue-500/5 border border-blue-500/10 p-3 flex flex-col gap-1.5",
    guideBorderClassName: "border-blue-500/10",
    initialForm: { vercelToken: "", projectName: "vercel-relay" },
    isValid: (form) => Boolean(form?.vercelToken?.trim()),
    info: {
      title: "What is Vercel Relay?",
      lead: "Deploys an edge relay function to Vercel. All AI provider requests will be forwarded through Vercel's edge network, masking your real IP from providers.",
      bullets: [
        "Your IP is replaced by Vercel's dynamic edge IPs (hundreds of IPs across 20+ global regions)",
        "Vercel serves millions of apps — providers can't block Vercel IPs without affecting legitimate traffic",
        "Free tier: 100GB bandwidth/month, 500K edge invocations",
        "Deploy multiple relays on different accounts for more IP diversity",
      ],
    },
    fields: [
      {
        key: "vercelToken",
        label: "Vercel API Token",
        placeholder: "your-vercel-api-token",
        type: "password",
        hint: (
          <>
            Token is used once for deployment and not stored.{" "}
            <a
              href="https://vercel.com/account/tokens"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              Get token &rarr;
            </a>
          </>
        ),
      },
      {
        key: "projectName",
        label: "Project Name",
        placeholder: "my-relay",
        type: "text",
        hint: "Unique name for your Vercel project. Leave empty for auto-generated name.",
      },
    ],
  },
  cloudflare: {
    id: "cloudflare",
    name: "Cloudflare",
    modalTitle: "Deploy Cloudflare Relay",
    endpoint: "/api/proxy-pools/cloudflare-deploy",
    deployButtonText: "Deploy Worker",
    deployingButtonText: "Deploying...",
    boxClassName: "rounded-lg bg-orange-500/5 border border-orange-500/10 p-3 flex flex-col gap-1.5",
    guideBorderClassName: "border-orange-500/10",
    initialForm: { accountId: "", apiToken: "", projectName: "cloudflare-relay" },
    isValid: (form) => Boolean(form?.accountId?.trim() && form?.apiToken?.trim()),
    info: {
      title: "What is Cloudflare Relay?",
      lead: "Deploys a Cloudflare Worker as a proxy relay. All AI provider requests will be forwarded through Cloudflare's global edge network.",
      bullets: [
        "High performance global routing and IP masking via Cloudflare Workers",
        "Free tier: 100,000 requests per day",
        "Requires Cloudflare Account ID and a Workers API Token (Edit Workers permission)",
      ],
      guide: {
        title: "How to generate your API Token:",
        steps: [
          "Go to My Profile → API Tokens → Create Token",
          "Scroll down to Custom Token and click Get started",
          "Under Permissions: Account | Workers Scripts | Edit",
          "Under Account Resources: Include | Account | Your Account Name",
          "Click Continue to summary → Create Token",
        ],
      },
    },
    fields: [
      {
        key: "accountId",
        label: "Account ID",
        placeholder: "your-cloudflare-account-id",
        type: "text",
        hint: "Found on the right side of the Cloudflare dashboard overview page.",
      },
      {
        key: "apiToken",
        label: "API Token",
        placeholder: "your-cloudflare-api-token",
        type: "password",
        hint: (
          <>
            Requires &quot;Workers Scripts: Edit&quot; permission.{" "}
            <a
              href="https://dash.cloudflare.com/profile/api-tokens"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              Get token &rarr;
            </a>
          </>
        ),
      },
      {
        key: "projectName",
        label: "Worker Name",
        placeholder: "my-relay",
        type: "text",
        hint: "Unique name for your Cloudflare Worker. Leave empty for auto-generated name.",
      },
    ],
  },
  deno: {
    id: "deno",
    name: "Deno",
    modalTitle: "Deploy Deno Relay",
    endpoint: "/api/proxy-pools/deno-deploy",
    deployButtonText: "Deploy Relay",
    deployingButtonText: "Deploying...",
    boxClassName: "rounded-lg bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 p-3 flex flex-col gap-1.5",
    guideBorderClassName: "border-black/10 dark:border-white/10",
    initialForm: { denoToken: "", orgDomain: "", projectName: "" },
    isValid: (form) => Boolean(form?.denoToken?.trim() && form?.orgDomain?.trim()),
    info: {
      title: "What is Deno Relay?",
      lead: "Deploys a relay worker to Deno Deploy's global edge network. All AI provider requests are forwarded through Deno's edge, masking your real IP.",
      bullets: [
        "Deno Deploy v2 runs on a high-performance global edge network",
        "Free tier: 1M requests & 100GiB outbound traffic per month",
        "No per-request CPU time limits (unlike Vercel/Cloudflare)",
        "Support up to 20 active apps & 50 custom domains",
        "Deploy multiple relays for maximum IP diversity",
      ],
      guide: {
        title: "How to generate API token:",
        steps: [
          "Go to console.deno.com",
          "Select your Organization → Settings → Organization Tokens",
          "Create a Organization Token (prefix ddo_)",
        ],
      },
    },
    fields: [
      {
        key: "denoToken",
        label: "Deno Deploy API Token",
        placeholder: "ddo_xxxxxxxxxxxxxxxx",
        type: "password",
        hint: "Token is used once for deployment, not stored. Found in Organization Settings.",
      },
      {
        key: "orgDomain",
        label: "Organization Domain",
        placeholder: "your-org.deno.net",
        type: "text",
        hint: "Organization's default domain. Your relay URL will be in the format: https://my-relay.your-org.deno.net",
      },
      {
        key: "projectName",
        label: "App Name",
        placeholder: "deno-relay",
        type: "text",
        hint: "Unique app name. Leave empty for auto-generated name.",
      },
    ],
  },
  netlify: {
    id: "netlify",
    name: "Netlify",
    modalTitle: "Deploy Netlify Relay",
    endpoint: "/api/proxy-pools/netlify-deploy",
    deployButtonText: "Deploy",
    deployingButtonText: "Deploying... (may take ~1 min)",
    boxClassName: "rounded-lg bg-teal-500/5 border border-teal-500/10 p-3 flex flex-col gap-1.5",
    guideBorderClassName: "border-teal-500/10",
    initialForm: { netlifyToken: "", projectName: "netlify-relay" },
    isValid: (form) => Boolean(form?.netlifyToken?.trim()),
    info: {
      title: "What is Netlify Relay?",
      lead: "Deploys a serverless relay function to Netlify's global edge network. All AI provider requests are forwarded through Netlify's edge, masking your real IP.",
      bullets: [
        "Runs on Netlify Functions with a 60-second execution limit and streaming support",
        "Free tier: 125,000 function invocations and 100GB bandwidth per month",
        "Relay URL format: https://your-site.netlify.app/.netlify/functions/relay",
        "Deploy multiple relays on different accounts for more IP diversity",
      ],
      guide: {
        title: "How to generate API token:",
        steps: [
          "Go to User Settings → Applications → Personal access tokens",
          "Select New access token and generate a token",
          "Copy the token — you won't see it again after leaving the page",
        ],
      },
    },
    fields: [
      {
        key: "netlifyToken",
        label: "Netlify API Token",
        placeholder: "nfp_xxxxxxxxxxxxxxxx",
        type: "password",
        hint: (
          <>
            Token is used once for deployment and not stored.{" "}
            <a
              href="https://app.netlify.com/user/applications#personal-access-tokens"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              Get token &rarr;
            </a>
          </>
        ),
      },
      {
        key: "projectName",
        label: "Site Name",
        placeholder: "netlify-relay",
        type: "text",
        hint: "Unique site name (lowercase letters, numbers, hyphens). Your relay URL will be https://site-name.netlify.app/.netlify/functions/relay",
      },
    ],
  },
};

export default function RelayDeployModal({
  provider,
  form = {},
  onChange,
  onDeploy,
  onClose,
  deploying = false,
}) {
  const config = provider ? RELAY_PROVIDERS[provider] : null;

  if (!config) return null;

  const isValid = config.isValid(form);

  return (
    <Modal isOpen={Boolean(provider)} title={config.modalTitle} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className={config.boxClassName}>
          <p className="text-sm font-medium text-text-main">{config.info.title}</p>
          <p className="text-xs text-text-muted">{config.info.lead}</p>
          <ul className="list-disc space-y-0.5 pl-4 text-xs text-text-muted">
            {config.info.bullets.map((bullet, idx) => (
              <li key={idx}>{bullet}</li>
            ))}
          </ul>
          {config.info.guide && (
            <div className={`mt-2 border-t pt-2 text-xs text-text-muted ${config.guideBorderClassName}`}>
              <p className="mb-1 font-medium text-text-main">{config.info.guide.title}</p>
              <ol className="list-decimal space-y-0.5 pl-4">
                {config.info.guide.steps.map((step, idx) => (
                  <li key={idx}>{step}</li>
                ))}
              </ol>
            </div>
          )}
        </div>

        {config.fields.map((field) => (
          <Input
            key={field.key}
            label={field.label}
            value={form[field.key] || ""}
            onChange={(e) => onChange?.(field.key, e.target.value)}
            placeholder={field.placeholder}
            hint={field.hint}
            type={field.type || "text"}
          />
        ))}

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Button
            fullWidth
            onClick={() => onDeploy?.(provider)}
            disabled={!isValid || deploying}
          >
            {deploying ? config.deployingButtonText : config.deployButtonText}
          </Button>
          <Button fullWidth variant="ghost" onClick={onClose} disabled={deploying}>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
}
